import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { validUuid } from './env.js';
import { PrismaService } from './prisma.service.js';
import { PAYMENT_LEGAL_VERSIONS, paymentLegalAccepted } from './legal-acceptance.js';
import { MockPaymentProvider, selectedProvider, type PaymentChannel, type PaymentLanguage, type PaymentProvider, type PaymentSnapshot, type ProviderConfirmation } from './payment-provider.js';

const keyPattern = /^[A-Za-z0-9._:@/-]{1,200}$/;
const POSTGRES_INT_MAX = 2_147_483_647;
type CheckoutQuote = {
  orderType: 'CREDIT_PURCHASE' | 'AGENCY_SUBSCRIPTION';
    packId: string; packKey: string; packName: string; periodDays: number | null; quantity: number; unitCredits: number; credits: number;
  currency: string; unitPriceMinor: number; discountMinor: number; discountRule: string | null;
  taxEnabled: boolean; taxRule: string | null; taxRateBps: number; taxMinor: number;
  subtotalMinor: number; totalMinor: number; priceScheduleId: string; priceScheduleVersion: number;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Le corps de la requête est invalide.');
  return value as Record<string, unknown>;
}
function duplicate(error: unknown) { return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'; }
function key(value: unknown) {
  if (typeof value !== 'string' || !keyPattern.test(value)) throw new BadRequestException('La clé Idempotency-Key est obligatoire et invalide.');
  return value;
}
function requestedChannel(value: unknown): PaymentChannel {
  if (value === undefined) return 'CARD_AND_MOBILE_MONEY';
  if (value === 'CARD_ONLY' || value === 'MOBILE_MONEY_ONLY' || value === 'CARD_AND_MOBILE_MONEY') return value;
  throw new BadRequestException('Le moyen de paiement sélectionné est invalide.');
}
function orderChannel(metadata: unknown): PaymentChannel {
  const saved = metadata && typeof metadata === 'object' && 'paymentChannel' in metadata ? (metadata as Record<string, unknown>)['paymentChannel'] : undefined;
  return saved === 'CARD_ONLY' || saved === 'MOBILE_MONEY_ONLY' ? saved : 'CARD_AND_MOBILE_MONEY';
}

@Injectable()
export class PaymentsService {
  private readonly provider: PaymentProvider = selectedProvider();
  private readonly billingUrl = process.env['BILLING_SERVICE_URL'] ?? 'http://billing:3010';

  constructor(private readonly prisma: PrismaService) {}

  private async checkoutQuote(authorization: string, packId: string, quantity: number, orderType: CheckoutQuote['orderType']): Promise<CheckoutQuote> {
    const response = await fetch(`${this.billingUrl.replace(/\/$/, '')}/v1/checkout-quotes`, {
      method: 'POST', headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ packId, quantity, orderType }), cache: 'no-store', signal: AbortSignal.timeout(5_000),
    }).catch(() => { throw new ServiceUnavailableException('Billing est momentanément indisponible.'); });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new BadGatewayException('Billing n’a pas pu établir le devis de commande.');
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new BadGatewayException('Le devis Billing est invalide.');
    const quote = result as CheckoutQuote;
    const integerFields = [quote.quantity, quote.unitCredits, quote.credits, quote.unitPriceMinor, quote.discountMinor, quote.taxRateBps, quote.taxMinor, quote.subtotalMinor, quote.totalMinor, quote.priceScheduleVersion];
    const expectedTax = quote.taxEnabled ? Math.round(quote.subtotalMinor * quote.taxRateBps / 10_000) : 0;
    if (
      quote.orderType !== orderType || quote.packId !== packId || quote.quantity !== quantity || !integerFields.every(Number.isSafeInteger) ||
      (orderType === 'AGENCY_SUBSCRIPTION' && quote.periodDays !== 30) ||
      quote.unitCredits < 1 || quote.credits !== quote.unitCredits * quote.quantity ||
      quote.unitPriceMinor < 1 || quote.discountMinor < 0 || quote.discountMinor > quote.unitPriceMinor * quote.quantity ||
      quote.subtotalMinor !== quote.unitPriceMinor * quote.quantity - quote.discountMinor ||
      quote.taxMinor !== expectedTax || quote.totalMinor !== quote.subtotalMinor + quote.taxMinor ||
      [quote.credits, quote.unitPriceMinor, quote.subtotalMinor, quote.taxMinor, quote.totalMinor].some((value) => value > POSTGRES_INT_MAX) ||
      !/^[A-Z]{3}$/.test(quote.currency) || !/^[0-9a-f-]{36}$/i.test(quote.priceScheduleId) || quote.priceScheduleVersion < 1 ||
      typeof quote.taxEnabled !== 'boolean' ||
      (quote.taxEnabled && (typeof quote.taxRule !== 'string' || !quote.taxRule || quote.taxRateBps < 1 || quote.taxRateBps > 10_000)) ||
      (!quote.taxEnabled && (quote.taxRule !== null || quote.taxRateBps !== 0 || quote.taxMinor !== 0)) ||
      (quote.discountMinor > 0 && (typeof quote.discountRule !== 'string' || !quote.discountRule)) ||
      (quote.discountMinor === 0 && quote.discountRule !== null)
    ) throw new BadGatewayException('Le devis Billing ne respecte pas les invariants de calcul.');
    return quote;
  }

  async create(ownerSubject: string, authorization: string, rawKey: string, body: unknown, customer: { name: string; email: string } = { name: '', email: '' }) {
    const idempotencyKey = key(rawKey); const input = object(body);
    if (!paymentLegalAccepted(input)) throw new BadRequestException({ error: 'LEGAL_TERMS_NOT_ACCEPTED' });
    if (Object.keys(input).some((field) => !['packId', 'quantity', 'orderType', 'businessReference', 'expectedPriceScheduleId', 'expectedPriceScheduleVersion', 'channel', 'salesTermsAccepted', 'refundPolicyAccepted'].includes(field))) throw new BadRequestException('Champs de commande non autorisés.');
    const channel = requestedChannel(input['channel']);
    if (typeof input['packId'] !== 'string') throw new BadRequestException('Le pack demandé est invalide.');
    const orderType = input['orderType'] === undefined ? 'CREDIT_PURCHASE' : input['orderType'];
    if (orderType !== 'CREDIT_PURCHASE' && orderType !== 'AGENCY_SUBSCRIPTION') throw new BadRequestException('Le type de commande est invalide.');
    const businessReference: string | null = typeof input['businessReference'] === 'string' ? input['businessReference'] : null;
    if (orderType === 'AGENCY_SUBSCRIPTION' && (!businessReference || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(businessReference))) throw new BadRequestException('La souscription agence référencée est invalide.');
    if (orderType === 'CREDIT_PURCHASE' && input['businessReference'] !== undefined) throw new BadRequestException('Une commande de crédits ne peut pas référencer une souscription agence.');
    const expectedScheduleId = input['expectedPriceScheduleId'];
    const expectedScheduleVersion = input['expectedPriceScheduleVersion'];
    if (orderType === 'AGENCY_SUBSCRIPTION' && (typeof expectedScheduleId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedScheduleId) || !Number.isSafeInteger(expectedScheduleVersion) || (expectedScheduleVersion as number) < 1)) throw new BadRequestException('Agency checkout must identify the published price snapshot');
    const packId = validUuid(input['packId'], 'Le pack');
    const quantity = input['quantity'] === undefined ? 1 : input['quantity'];
    if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 100) throw new BadRequestException('La quantité doit être comprise entre 1 et 100.');
    let order = await this.prisma.paymentOrder.findUnique({ where: { ownerSubject_idempotencyKey: { ownerSubject, idempotencyKey } }, include: { payment: true } });
    if (order && (!order.salesTermsAcceptedAt || !order.refundPolicyAcceptedAt || order.salesTermsVersion !== PAYMENT_LEGAL_VERSIONS.salesTerms || order.refundPolicyVersion !== PAYMENT_LEGAL_VERSIONS.refundPolicy)) throw new BadRequestException({ error: 'LEGAL_TERMS_NOT_ACCEPTED' });
    if (order && (order.packId !== packId || order.quantity !== quantity || order.orderType !== orderType || order.businessReference !== businessReference || orderChannel(order.metadata) !== channel || (orderType === 'AGENCY_SUBSCRIPTION' && (order.priceScheduleId !== expectedScheduleId || order.priceScheduleVersion !== expectedScheduleVersion)))) throw new ConflictException('Cette clé d’idempotence a déjà été utilisée pour une autre commande.');
    if (!order) {
      const quote = await this.checkoutQuote(authorization, packId, quantity as number, orderType);
      if (orderType === 'AGENCY_SUBSCRIPTION' && (quote.priceScheduleId !== expectedScheduleId || quote.priceScheduleVersion !== expectedScheduleVersion)) throw new ConflictException('Agency plan pricing changed; reload the plan before checkout');
      this.provider.validateCheckout?.(quote.totalMinor, quote.currency);
      try {
        order = await this.prisma.$transaction(async (tx) => {
          const createdOrder = await tx.paymentOrder.create({ data: {
            orderType, businessReference: businessReference ?? null, ownerSubject, packId, packKey: quote.packKey, packName: quote.packName, credits: quote.credits,
            metadata: { packId: quote.packId, packKey: quote.packKey, orderType, periodDays: quote.periodDays, priceScheduleId: quote.priceScheduleId, priceScheduleVersion: quote.priceScheduleVersion, paymentChannel: channel },
            unitCredits: quote.unitCredits, quantity: quote.quantity, unitPriceMinor: quote.unitPriceMinor,
            discountMinor: quote.discountMinor, discountRule: quote.discountRule,
            taxEnabled: quote.taxEnabled, taxRule: quote.taxRule, taxRateBps: quote.taxRateBps, taxMinor: quote.taxMinor,
            subtotalMinor: quote.subtotalMinor, totalMinor: quote.totalMinor, amountMinor: quote.totalMinor,
            currency: quote.currency, priceScheduleId: validUuid(quote.priceScheduleId, 'La grille tarifaire'),
            priceScheduleVersion: quote.priceScheduleVersion, idempotencyKey,
            salesTermsVersion: PAYMENT_LEGAL_VERSIONS.salesTerms,
            refundPolicyVersion: PAYMENT_LEGAL_VERSIONS.refundPolicy,
            salesTermsAcceptedAt: new Date(),
            refundPolicyAcceptedAt: new Date(),
          } });
          const payment = await tx.payment.create({ data: { orderId: createdOrder.id, provider: this.provider.name, status: 'CREATED' } });
          await tx.outboxMessage.create({ data: { eventType: 'payment.created.v1', aggregateId: createdOrder.id, payload: { orderId: createdOrder.id, paymentId: payment.id, ownerSubject, ...quote } } });
          return tx.paymentOrder.findUniqueOrThrow({ where: { id: createdOrder.id }, include: { payment: true } });
        });
      } catch (error) {
        if (!duplicate(error)) throw error;
        order = await this.prisma.paymentOrder.findUnique({ where: { ownerSubject_idempotencyKey: { ownerSubject, idempotencyKey } }, include: { payment: true } });
        if (!order || order.packId !== packId || order.quantity !== quantity || order.orderType !== orderType || order.businessReference !== businessReference || orderChannel(order.metadata) !== channel || (orderType === 'AGENCY_SUBSCRIPTION' && (order.priceScheduleId !== expectedScheduleId || order.priceScheduleVersion !== expectedScheduleVersion))) throw new ConflictException('La clé de commande existe déjà.');
      }
    }
    if (!order?.payment) throw new ConflictException('La commande ne possède pas de paiement associé.');
    let payment = order.payment;
    const checkoutRecoveryBefore = new Date(Date.now() - 60_000);
    const canStartCheckout = payment.status === 'CREATED' || (payment.status === 'PROCESSING' && payment.checkoutUrl === null && !payment.providerOrderRef && payment.updatedAt < checkoutRecoveryBefore);
    if (canStartCheckout) {
      if (payment.provider !== this.provider.name) throw new ConflictException('Le prestataire de cette commande a changé. Contactez le support pour la reprendre.');
      let providerOrderRef = payment.providerOrderRef ?? null;
      let reservation = { count: 0 };
      for (let attempt = 0; attempt < 5; attempt++) {
        if (this.provider.createOrderReference && !providerOrderRef) providerOrderRef = this.provider.createOrderReference();
        try {
          reservation = await this.prisma.payment.updateMany({ where: { id: payment.id, OR: [{ status: 'CREATED' }, { status: 'PROCESSING', checkoutUrl: null, providerOrderRef: null, updatedAt: { lt: checkoutRecoveryBefore } }] }, data: { status: 'PROCESSING', ...(providerOrderRef ? { providerOrderRef } : {}) } });
          break;
        } catch (error) {
          if (!duplicate(error) || !this.provider.createOrderReference || attempt === 4) throw error;
          providerOrderRef = null;
        }
      }
      if (!reservation.count) {
        payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
        return this.present(order, payment);
      }
      const publicWebUrl = process.env['PUBLIC_WEB_URL'] ?? 'http://localhost:3000';
      let returnBase: URL;
      try { returnBase = new URL(publicWebUrl); } catch { throw new ServiceUnavailableException('Les URL de retour paiement ne sont pas configurées.'); }
      if (!['https:', 'http:'].includes(returnBase.protocol) || returnBase.username || returnBase.password || (returnBase.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(returnBase.hostname))) throw new ServiceUnavailableException('Les URL de retour paiement ne sont pas configurées de façon sûre.');
      const returnUrl = (result: 'success' | 'cancel' | 'error') => { const url = new URL(`/payments/result/${result}`, returnBase.origin); url.searchParams.set('paymentId', payment.id); return url.toString(); };
      const snapshot: PaymentSnapshot = {
        id: payment.id, amountMinor: order.amountMinor, currency: order.currency, packName: order.packName, ownerSubject,
        ...(providerOrderRef ? { providerOrderRef } : {}),
        ...(this.provider.name === 'easypay' ? {
          customerName: customer.name || customer.email.split('@')[0] || 'Client InvitaFlow', customerEmail: customer.email,
          channel, language: 'FR' as PaymentLanguage,
          successUrl: returnUrl('success'), cancelUrl: returnUrl('cancel'), errorUrl: returnUrl('error'),
        } : {}),
      };
      try {
        const checkout = await this.provider.createPayment(snapshot);
        await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PROCESSING', checkoutUrl: null }, data: { status: 'PENDING', checkoutUrl: checkout.checkoutUrl, providerReference: checkout.providerReference, failureCode: null } });
      } catch (error) {
        if (this.provider.name === 'easypay') await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PROCESSING', checkoutUrl: null }, data: { failureCode: 'provider_initialization_uncertain' } });
        else await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PROCESSING', checkoutUrl: null }, data: { status: 'CREATED' } });
        throw error;
      }
      payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }
    return this.present(order, payment);
  }

  async list(ownerSubject: string, rawLimit?: string, cursor?: string) {
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (cursor !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor)) throw new BadRequestException('Le curseur de paiement est invalide.');
    if (cursor && !(await this.prisma.payment.findFirst({ where: { id: cursor, order: { ownerSubject } }, select: { id: true } }))) throw new BadRequestException('Le curseur ne correspond pas à un paiement du compte.');
    const rows = await this.prisma.payment.findMany({ where: { order: { ownerSubject } }, include: { order: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((payment) => this.present(payment.order, payment));
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async get(ownerSubject: string, paymentId: string) {
    const id = validUuid(paymentId, 'Le paiement');
    const order = await this.prisma.paymentOrder.findFirst({ where: { ownerSubject, payment: { id } }, include: { payment: true } });
    if (!order?.payment) throw new NotFoundException('Paiement introuvable.');
    return this.present(order, order.payment);
  }

  async reconcilePayment(ownerSubject: string, paymentId: string) {
    const id = validUuid(paymentId, 'Le paiement');
    const order = await this.prisma.paymentOrder.findFirst({ where: { ownerSubject, payment: { id } }, include: { payment: true } });
    if (!order?.payment) throw new NotFoundException('Paiement introuvable.');
    const payment = order.payment;
    if (payment.provider !== this.provider.name || !payment.providerReference || ['SUCCEEDED', 'REFUNDED'].includes(payment.status)) return this.present(order, payment);
    const confirmation = await this.provider.getStatus(payment.providerReference);
    if (!confirmation) return this.present(order, payment);
    if (!this.confirmationMatches(payment, order, confirmation)) {
      await this.recordAnomaly(payment.id, payment.status, `EASYPAY_MISMATCH:${confirmation.providerStatus}`);
      return this.present(order, payment);
    }
    const eventHash = createHash('sha256').update(`reconcile:${payment.id}:${confirmation.providerReference ?? confirmation.transactionId}:${confirmation.providerStatus}:${confirmation.amountMinor}:${confirmation.currency}`).digest('hex');
    await this.applyConfirmation(this.provider.name, eventHash, { ...confirmation, reference: payment.id });
    return this.get(ownerSubject, payment.id);
  }

  async easyPayIpn(body: unknown) {
    if (this.provider.name !== 'easypay' || !this.provider.extractNotificationReference) throw new NotFoundException('Prestataire de paiement inconnu.');
    const suppliedReference = this.provider.extractNotificationReference(body);
    const payment = await this.prisma.payment.findFirst({
      where: { provider: 'easypay', OR: [{ providerReference: suppliedReference }, { providerOrderRef: suppliedReference }] },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Référence de notification inconnue.');
    if (!payment.providerReference) return { received: true, verified: false };
    const confirmation = await this.provider.getStatus(payment.providerReference);
    if (!confirmation) return { received: true, verified: false };
    if (!this.confirmationMatches(payment, payment.order, confirmation)) {
      await this.recordAnomaly(payment.id, payment.status, `EASYPAY_IPN_MISMATCH:${confirmation.providerStatus}`);
      return { received: true, verified: false };
    }
    const eventHash = createHash('sha256').update(`ipn:${payment.id}:${confirmation.providerReference ?? confirmation.transactionId}:${confirmation.providerStatus}:${confirmation.amountMinor}:${confirmation.currency}`).digest('hex');
    await this.applyConfirmation('easypay', eventHash, { ...confirmation, reference: payment.id });
    return { received: true, verified: true };
  }

  private confirmationMatches(payment: { providerReference: string | null; providerOrderRef: string | null }, order: { amountMinor: number; currency: string }, confirmation: ProviderConfirmation) {
    const providerReference = confirmation.providerReference ?? confirmation.reference;
    return order.amountMinor === confirmation.amountMinor && order.currency === confirmation.currency &&
      (!payment.providerReference || providerReference === payment.providerReference) &&
      (!payment.providerOrderRef || !confirmation.providerOrderRef || confirmation.providerOrderRef === payment.providerOrderRef);
  }

  private present(order: { id: string; orderType: string; packId: string; packKey: string; packName: string; credits: number; unitCredits: number; quantity: number; unitPriceMinor: number; discountMinor: number; discountRule: string | null; taxEnabled: boolean; taxRule: string | null; taxRateBps: number; taxMinor: number; subtotalMinor: number; totalMinor: number; amountMinor: number; currency: string; priceScheduleId: string; priceScheduleVersion: number; status: string; createdAt: Date }, payment: { id: string; provider: string; status: string; checkoutUrl: string | null; providerTransactionId: string | null; providerRefundId: string | null; failureCode: string | null; paidAt: Date | null; createdAt: Date }) {
    return { id: payment.id, status: payment.status, provider: payment.provider, checkoutUrl: payment.checkoutUrl, providerTransactionId: payment.providerTransactionId, providerRefundId: payment.providerRefundId, failureCode: payment.failureCode, paidAt: payment.paidAt, createdAt: payment.createdAt, order: { id: order.id, orderType: order.orderType, status: order.status, packId: order.packId, packKey: order.packKey, packName: order.packName, credits: order.credits, unitCredits: order.unitCredits, quantity: order.quantity, unitPriceMinor: order.unitPriceMinor, discountMinor: order.discountMinor, discountRule: order.discountRule, taxEnabled: order.taxEnabled, taxRule: order.taxRule, taxRateBps: order.taxRateBps, taxMinor: order.taxMinor, subtotalMinor: order.subtotalMinor, totalMinor: order.totalMinor, amountMinor: order.amountMinor, currency: order.currency, priceScheduleId: order.priceScheduleId, priceScheduleVersion: order.priceScheduleVersion, createdAt: order.createdAt }, mockConfirmationAvailable: payment.provider === 'mock' && process.env['NODE_ENV'] !== 'production' && ['PENDING', 'PROCESSING'].includes(payment.status) };
  }

  async mockConfirm(ownerSubject: string, paymentId: string) {
    if (!(this.provider instanceof MockPaymentProvider) || process.env['NODE_ENV'] === 'production') throw new NotFoundException();
    const payment = await this.prisma.payment.findFirst({ where: { id: validUuid(paymentId, 'Le paiement'), provider: 'mock', order: { ownerSubject } }, include: { order: true } });
    if (!payment) throw new NotFoundException('Paiement introuvable.');
    if (payment.status === 'SUCCEEDED') return this.present(payment.order, payment);
    if (!['PENDING', 'PROCESSING'].includes(payment.status)) throw new ConflictException('Ce paiement ne peut plus être confirmé par le Mock Provider.');
    const notification = this.provider.createNotification({ id: payment.id, amountMinor: payment.order.amountMinor, currency: payment.order.currency, packName: payment.order.packName, ownerSubject });
    const confirmation = await this.provider.verifyPayment(notification);
    const serialized = JSON.stringify(notification.body);
    if (typeof serialized !== 'string') throw new BadRequestException('Notification Mock Provider invalide.');
    await this.applyConfirmation('mock', createHash('sha256').update(serialized).digest('hex'), confirmation);
    return this.get(ownerSubject, payment.id);
  }

  async refund(paymentId: string) {
    const id = validUuid(paymentId, 'Le paiement');
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment) throw new NotFoundException('Paiement introuvable.');
    if (payment.status === 'REFUNDED') return this.present(payment.order, payment);
    if (payment.status !== 'SUCCEEDED') throw new ConflictException('Seul un paiement confirmé peut être remboursé.');
    const claimed = await this.prisma.payment.updateMany({ where: { id, status: 'SUCCEEDED' }, data: { status: 'REFUND_PENDING' } });
    if (!claimed.count) throw new ConflictException('Un remboursement est déjà en cours ou le paiement a changé de statut.');
    let result: Awaited<ReturnType<PaymentProvider['refundPayment']>>;
    try { result = await this.provider.refundPayment(payment.id); }
    catch (error) {
      // Provider timeouts can be ambiguous. Keep the payment pending for finance reconciliation
      // instead of allowing an automatic retry to issue a second refund.
      throw error;
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`);
      const current = await tx.payment.findUniqueOrThrow({ where: { id }, include: { order: true } });
      if (current.status === 'REFUNDED') return current;
      if (current.status !== 'REFUND_PENDING') throw new ConflictException('Le paiement a changé de statut pendant le remboursement.');
      await tx.payment.update({ where: { id }, data: { status: result.status, providerRefundId: result.providerRefundId } });
      if (result.status === 'REFUNDED') {
        await tx.paymentOrder.update({ where: { id: current.orderId }, data: { status: 'REFUNDED' } });
        await this.reversePartnerCommission(tx, id);
        const payload = { paymentId: id, orderId: current.orderId, orderType: current.order.orderType, ownerSubject: current.order.ownerSubject, customerSubject: current.order.ownerSubject, credits: current.order.credits, amountMinor: current.order.amountMinor, currency: current.order.currency, provider: current.provider, providerRefundId: result.providerRefundId, metadata: { packId: current.order.packId, packKey: current.order.packKey, priceScheduleId: current.order.priceScheduleId, priceScheduleVersion: current.order.priceScheduleVersion } };
        if (current.order.orderType === 'CREDIT_PURCHASE') await tx.outboxMessage.create({ data: { eventType: 'payment.refunded.v1', aggregateId: id, payload } });
        await tx.outboxMessage.create({ data: { eventType: 'payment.refunded.v2', aggregateId: id, payload } });
      }
      return tx.payment.findUniqueOrThrow({ where: { id }, include: { order: true } });
    });
    return this.present(updated.order, updated);
  }

  async adminPayments(input: { provider?: string; limit?: string; cursor?: string }) {
    const provider = input.provider?.toLowerCase();
    if (provider && !['mock', 'flexpay', 'easypay', 'cinetpay'].includes(provider)) throw new BadRequestException('Le fournisseur de paiement est invalide.');
    const limit = input.limit === undefined ? 50 : Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (input.cursor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.cursor)) throw new BadRequestException('Le curseur est invalide.');
    if (input.cursor && !(await this.prisma.payment.findUnique({ where: { id: input.cursor }, select: { id: true } }))) throw new BadRequestException('Le curseur ne correspond pas à un paiement.');
    const rows = await this.prisma.payment.findMany({
      where: provider ? { provider } : {},
      include: { order: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(({ id, provider, providerTransactionId, status, createdAt, paidAt, order }) => ({
      id, provider, providerTransactionId, status, createdAt, confirmedAt: paidAt,
      order: { id: order.id, packName: order.packName, credits: order.credits, amountMinor: order.amountMinor, currency: order.currency, priceScheduleVersion: order.priceScheduleVersion },
    }));
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async providerWebhook(providerName: string, headers: Record<string, string | string[] | undefined>, body: unknown) {
    if (providerName === 'easypay') return this.easyPayIpn(body);
    if (providerName !== this.provider.name || providerName === 'mock') throw new NotFoundException('Prestataire de paiement inconnu.');
    const confirmation = await this.provider.verifyPayment({ headers, body });
    const serialized = typeof body === 'string' ? body : JSON.stringify(body);
    if (typeof serialized !== 'string') throw new BadRequestException('Notification fournisseur invalide.');
    const eventHash = createHash('sha256').update(serialized).digest('hex');
    const paymentId = validUuid(confirmation.reference, 'La référence de paiement');
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment || payment.provider !== providerName) throw new NotFoundException('Paiement associé à cette notification introuvable.');
    if (payment.order.amountMinor !== confirmation.amountMinor || payment.order.currency !== confirmation.currency) throw new BadRequestException('Le montant ou la devise confirmés ne correspondent pas à la commande.');
    await this.applyConfirmation(providerName, eventHash, confirmation);
    return { received: true };
  }

  private async applyConfirmation(providerName: string, eventHash: string, confirmation: ProviderConfirmation) {
    const paymentId = validUuid(confirmation.reference, 'Le paiement');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.webhookReceipt.create({ data: { provider: providerName, eventHash } });
        await tx.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`);
        const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
        if (!payment || payment.provider !== providerName) throw new NotFoundException('Paiement introuvable.');
        const newStatus = confirmation.status;
        if (payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') return;
        if (payment.order.amountMinor !== confirmation.amountMinor || payment.order.currency !== confirmation.currency) throw new BadRequestException('Le montant ou la devise confirmés ne correspondent pas à la commande.');
        if (payment.providerTransactionId && payment.providerTransactionId !== confirmation.transactionId) throw new ConflictException('La transaction fournisseur ne correspond pas à la tentative de paiement.');
        if (payment.status === newStatus) {
          if (payment.providerStatus !== confirmation.providerStatus) await tx.payment.update({ where: { id: paymentId }, data: { providerStatus: confirmation.providerStatus } });
          return;
        }
        const now = new Date();
        await tx.payment.update({ where: { id: paymentId }, data: { status: newStatus, providerStatus: confirmation.providerStatus, providerReference: confirmation.providerReference ?? payment.providerReference, providerTransactionId: newStatus === 'SUCCEEDED' ? confirmation.transactionId : payment.providerTransactionId, paidAt: newStatus === 'SUCCEEDED' ? (payment.paidAt ?? now) : null, failureCode: newStatus === 'FAILED' ? 'provider_declined' : newStatus === 'CANCELLED' ? 'provider_cancelled' : null } });
        if (newStatus === 'SUCCEEDED') {
          await tx.paymentOrder.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
          const attribution = await tx.referralAttribution.findUnique({ where: { customerSubject: payment.order.ownerSubject }, include: { partner: true } });
          if (attribution?.status === 'ACTIVE' && attribution.partner.status === 'ACTIVE' && attribution.partner.ownerSubject !== payment.order.ownerSubject && attribution.partner.eligibleOrderTypes.includes(payment.order.orderType) && attribution.partner.commissionRateBps > 0) {
            const commissionAmountMinor = Math.floor(payment.order.amountMinor * attribution.partner.commissionRateBps / 10_000);
            if (commissionAmountMinor > 0 && commissionAmountMinor <= POSTGRES_INT_MAX) await tx.commissionLedgerEntry.createMany({ data: [{
              partnerId: attribution.partnerId, attributionId: attribution.id, paymentId: payment.id, originalPaymentId: payment.id,
              orderId: payment.orderId, status: 'PENDING', orderType: payment.order.orderType,
              baseAmountMinor: payment.order.amountMinor, commissionAmountMinor,
              rateBpsSnapshot: attribution.partner.commissionRateBps, currency: payment.order.currency,
            }], skipDuplicates: true });
          }
          const payload = { paymentId: payment.id, orderId: payment.orderId, orderType: payment.order.orderType, businessReference: payment.order.businessReference, ownerSubject: payment.order.ownerSubject, customerSubject: payment.order.ownerSubject, credits: payment.order.credits, amountMinor: payment.order.amountMinor, currency: payment.order.currency, provider: providerName, providerTransactionId: confirmation.transactionId, metadata: payment.order.metadata };
          if (payment.order.orderType === 'CREDIT_PURCHASE') await tx.outboxMessage.create({ data: { eventType: 'payment.succeeded.v1', aggregateId: payment.id, payload } });
          await tx.outboxMessage.create({ data: { eventType: 'payment.succeeded.v2', aggregateId: payment.id, payload } });
        } else if (newStatus === 'FAILED') {
          await tx.outboxMessage.create({ data: { eventType: 'payment.failed.v1', aggregateId: payment.id, payload: { paymentId: payment.id, orderId: payment.orderId, ownerSubject: payment.order.ownerSubject, failureCode: 'provider_declined' } } });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    } catch (error) {
      if (duplicate(error)) {
        const receipt = await this.prisma.webhookReceipt.findUnique({ where: { provider_eventHash: { provider: providerName, eventHash } } });
        if (receipt) return;
        throw new ConflictException('Cette transaction fournisseur est déjà associée à un autre paiement.');
      }
      throw error;
    }
  }

  private async reversePartnerCommission(tx: Prisma.TransactionClient, paymentId: string) {
    const originalCommission = await tx.commissionLedgerEntry.findUnique({ where: { originalPaymentId: paymentId } });
    if (!originalCommission) return;
    await tx.commissionLedgerEntry.createMany({ data: [{
      partnerId: originalCommission.partnerId, attributionId: originalCommission.attributionId, paymentId,
      orderId: originalCommission.orderId, originalEntryId: originalCommission.id, status: 'REVERSED',
      orderType: originalCommission.orderType, baseAmountMinor: originalCommission.baseAmountMinor,
      commissionAmountMinor: -originalCommission.commissionAmountMinor, rateBpsSnapshot: originalCommission.rateBpsSnapshot,
      currency: originalCommission.currency,
    }], skipDuplicates: true });
    if (originalCommission.status !== 'REVERSED' && originalCommission.status !== 'PAID') await tx.commissionLedgerEntry.update({ where: { id: originalCommission.id }, data: { status: 'REVERSED' } });
  }

  async reconcile() {
    const cutoff = new Date(Date.now() - 60_000);
    const payments = await this.prisma.payment.findMany({ where: { provider: this.provider.name, status: { in: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'] }, OR: [{ reconciliationAttemptAt: null }, { reconciliationAttemptAt: { lt: cutoff } }] }, include: { order: true }, orderBy: [{ reconciliationAttemptAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }], take: 10 });
    for (const payment of payments) {
      const leasedAt = new Date();
      const lease = await this.prisma.payment.updateMany({ where: { id: payment.id, OR: [{ reconciliationAttemptAt: null }, { reconciliationAttemptAt: { lt: cutoff } }] }, data: { reconciliationAttemptAt: leasedAt } });
      if (!lease.count) continue;
      if (this.provider.name === 'easypay' && !payment.providerReference) continue;
      const providerLookup = this.provider.name === 'easypay' ? payment.providerReference! : payment.id;
      let confirmation: ProviderConfirmation | null;
      try { confirmation = await this.provider.getStatus(providerLookup); }
      catch { continue; }
      if (!confirmation) continue;
      const isEasyPay = this.provider.name === 'easypay';
      const referenceMatches = isEasyPay ? (confirmation.providerReference ?? confirmation.reference) === payment.providerReference : confirmation.reference === payment.id;
      if (!referenceMatches || isEasyPay && payment.providerOrderRef && confirmation.providerOrderRef && confirmation.providerOrderRef !== payment.providerOrderRef) {
        await this.recordAnomaly(payment.id, payment.status, `REFERENCE_MISMATCH:${confirmation.providerStatus}`);
        continue;
      }
      if (payment.order.amountMinor !== confirmation.amountMinor || payment.order.currency !== confirmation.currency) {
        await this.recordAnomaly(payment.id, payment.status, `AMOUNT_OR_CURRENCY_MISMATCH:${confirmation.providerStatus}`);
        continue;
      }
      const internalPaid = payment.status === 'SUCCEEDED';
      const internalFailed = ['FAILED', 'CANCELLED', 'EXPIRED'].includes(payment.status);
      const internalOpen = ['CREATED', 'PENDING', 'PROCESSING'].includes(payment.status);
      const isAligned = (internalPaid && confirmation.status === 'SUCCEEDED') ||
        (payment.status === 'FAILED' && confirmation.status === 'FAILED') ||
        (payment.status === 'CANCELLED' && confirmation.status === 'CANCELLED') ||
        (payment.status === 'EXPIRED' && confirmation.status === 'EXPIRED') ||
        (internalOpen && confirmation.status === 'PROCESSING');
      if (isAligned) {
        await this.resolveAnomalies(payment.id);
      } else if ((internalOpen || internalFailed) && confirmation.status === 'SUCCEEDED') {
        await this.applyConfirmation(this.provider.name, createHash('sha256').update(`reconcile:${payment.id}:${confirmation.providerReference ?? confirmation.providerStatus}:${confirmation.providerStatus}:${confirmation.amountMinor}:${confirmation.currency}`).digest('hex'), { ...confirmation, reference: payment.id });
        await this.resolveAnomalies(payment.id);
      } else if (internalOpen && confirmation.status === 'FAILED') {
        await this.applyConfirmation(this.provider.name, createHash('sha256').update(`reconcile:${payment.id}:${confirmation.providerReference ?? confirmation.providerStatus}:${confirmation.providerStatus}:${confirmation.amountMinor}:${confirmation.currency}`).digest('hex'), { ...confirmation, reference: payment.id });
        await this.resolveAnomalies(payment.id);
      } else {
        await this.recordAnomaly(payment.id, payment.status, confirmation.providerStatus);
      }
    }
  }

  async reconciliationIssues() {
    return this.prisma.paymentReconciliationIssue.findMany({ where: { resolvedAt: null }, orderBy: { lastSeenAt: 'desc' }, take: 100, select: { id: true, paymentId: true, internalStatus: true, providerStatus: true, firstSeenAt: true, lastSeenAt: true, occurrences: true } });
  }

  private async recordAnomaly(paymentId: string, internalStatus: string, providerStatus: string) {
    const normalizedProviderStatus = providerStatus.slice(0, 80);
    const fingerprint = createHash('sha256').update(`${paymentId}:${internalStatus}:${normalizedProviderStatus}`).digest('hex');
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.paymentReconciliationIssue.findUnique({ where: { fingerprint } });
      if (existing) {
        await tx.paymentReconciliationIssue.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), occurrences: { increment: 1 }, resolvedAt: null } });
        if (existing.resolvedAt) await tx.outboxMessage.create({ data: { eventType: 'payment.reconciliation-anomaly.v1', aggregateId: existing.id, payload: { issueId: existing.id, paymentId, internalStatus, providerStatus: normalizedProviderStatus, reopened: true } } });
        return;
      }
      const issue = await tx.paymentReconciliationIssue.create({ data: { paymentId, fingerprint, internalStatus, providerStatus: normalizedProviderStatus } });
      await tx.outboxMessage.create({ data: { eventType: 'payment.reconciliation-anomaly.v1', aggregateId: issue.id, payload: { issueId: issue.id, paymentId, internalStatus, providerStatus: normalizedProviderStatus } } });
    });
  }

  private async resolveAnomalies(paymentId: string) {
    const issues = await this.prisma.paymentReconciliationIssue.findMany({ where: { paymentId, resolvedAt: null }, select: { id: true, providerStatus: true } });
    for (const issue of issues) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.paymentReconciliationIssue.updateMany({ where: { id: issue.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
        if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'payment.reconciliation-resolved.v1', aggregateId: issue.id, payload: { issueId: issue.id, paymentId, previousProviderStatus: issue.providerStatus } } });
      });
    }
  }
}
