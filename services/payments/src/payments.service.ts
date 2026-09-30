import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { validUuid } from './env.js';
import { PrismaService } from './prisma.service.js';
import { MockPaymentProvider, selectedProvider, type PaymentProvider, type PaymentSnapshot, type ProviderConfirmation } from './payment-provider.js';

const keyPattern = /^[A-Za-z0-9._:@/-]{1,200}$/;
type CatalogPack = { id: string; key: string; name: string; credits: number; priceMinor: number; currency: string };
type Catalog = { scheduleId: string; version: number; effectiveAt: string; packs: CatalogPack[] };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Le corps de la requête est invalide.');
  return value as Record<string, unknown>;
}
function duplicate(error: unknown) { return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'; }
function key(value: unknown) {
  if (typeof value !== 'string' || !keyPattern.test(value)) throw new BadRequestException('La clé Idempotency-Key est obligatoire et invalide.');
  return value;
}

@Injectable()
export class PaymentsService {
  private readonly provider: PaymentProvider = selectedProvider();
  private readonly billingUrl = process.env['BILLING_SERVICE_URL'] ?? 'http://billing:3010';

  constructor(private readonly prisma: PrismaService) {}

  private async catalog(authorization: string): Promise<Catalog> {
    const response = await fetch(`${this.billingUrl.replace(/\/$/, '')}/v1/pricing`, { headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(5_000) }).catch(() => { throw new ServiceUnavailableException('La grille tarifaire est momentanément indisponible.'); });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== 'object' || !Array.isArray((result as { packs?: unknown }).packs)) throw new BadGatewayException('La grille tarifaire n’a pas pu être vérifiée.');
    const catalog = result as Catalog;
    if (!Number.isInteger(catalog.version) || typeof catalog.effectiveAt !== 'string') throw new BadGatewayException('La grille tarifaire a un format invalide.');
    return catalog;
  }

  async create(ownerSubject: string, authorization: string, rawKey: string, body: unknown) {
    const idempotencyKey = key(rawKey); const input = object(body);
    if (Object.keys(input).some((field) => field !== 'packId')) throw new BadRequestException('Seul le pack tarifaire peut être choisi.');
    if (typeof input['packId'] !== 'string') throw new BadRequestException('Le pack demandé est invalide.');
    const packId = validUuid(input['packId'], 'Le pack');
    let order = await this.prisma.paymentOrder.findUnique({ where: { ownerSubject_idempotencyKey: { ownerSubject, idempotencyKey } }, include: { payment: true } });
    if (order && order.packId !== packId) throw new ConflictException('Cette clé d’idempotence a déjà été utilisée pour un autre pack.');
    if (!order) {
      const catalog = await this.catalog(authorization);
      if (!Number.isInteger(catalog.version) || typeof catalog.effectiveAt !== 'string') throw new BadGatewayException('La grille tarifaire a un format invalide.');
      const pack = catalog.packs.find((entry) => entry.id === packId);
      if (!pack || !Number.isSafeInteger(pack.credits) || pack.credits < 1 || !Number.isSafeInteger(pack.priceMinor) || pack.priceMinor < 1 || !/^[A-Z]{3}$/.test(pack.currency)) throw new NotFoundException('Ce pack n’est plus disponible dans la grille tarifaire active.');
      this.provider.validateCheckout?.(pack.priceMinor, pack.currency);
      try {
        order = await this.prisma.$transaction(async (tx) => {
          const createdOrder = await tx.paymentOrder.create({ data: { ownerSubject, packId, packKey: pack.key, packName: pack.name, credits: pack.credits, amountMinor: pack.priceMinor, currency: pack.currency, priceScheduleId: validUuid(catalog.scheduleId, 'La grille tarifaire'), priceScheduleVersion: catalog.version, idempotencyKey } });
          const payment = await tx.payment.create({ data: { orderId: createdOrder.id, provider: this.provider.name, status: 'CREATED' } });
          await tx.outboxMessage.create({ data: { eventType: 'payment.created.v1', aggregateId: createdOrder.id, payload: { orderId: createdOrder.id, paymentId: payment.id, ownerSubject, packId, packKey: pack.key, credits: pack.credits, amountMinor: pack.priceMinor, currency: pack.currency, priceScheduleVersion: catalog.version } } });
          return tx.paymentOrder.findUniqueOrThrow({ where: { id: createdOrder.id }, include: { payment: true } });
        });
      } catch (error) {
        if (!duplicate(error)) throw error;
        order = await this.prisma.paymentOrder.findUnique({ where: { ownerSubject_idempotencyKey: { ownerSubject, idempotencyKey } }, include: { payment: true } });
        if (!order || order.packId !== packId) throw new ConflictException('La clé de commande existe déjà.');
      }
    }
    if (!order?.payment) throw new ConflictException('La commande ne possède pas de paiement associé.');
    let payment = order.payment;
    const checkoutRecoveryBefore = new Date(Date.now() - 60_000);
    const canStartCheckout = payment.status === 'CREATED' || (payment.status === 'PROCESSING' && payment.checkoutUrl === null && payment.updatedAt < checkoutRecoveryBefore);
    if (canStartCheckout) {
      if (payment.provider !== this.provider.name) throw new ConflictException('Le prestataire de cette commande a changé. Contactez le support pour la reprendre.');
      const reservation = await this.prisma.payment.updateMany({ where: { id: payment.id, OR: [{ status: 'CREATED' }, { status: 'PROCESSING', checkoutUrl: null, updatedAt: { lt: checkoutRecoveryBefore } }] }, data: { status: 'PROCESSING' } });
      if (!reservation.count) {
        payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
        return this.present(order, payment);
      }
      const snapshot: PaymentSnapshot = { id: payment.id, amountMinor: order.amountMinor, currency: order.currency, packName: order.packName, ownerSubject };
      try {
        const checkout = await this.provider.createPayment(snapshot);
        await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PROCESSING', checkoutUrl: null }, data: { status: 'PENDING', checkoutUrl: checkout.checkoutUrl, providerReference: checkout.providerReference } });
      } catch (error) {
        await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PROCESSING', checkoutUrl: null }, data: { status: 'CREATED' } });
        throw error;
      }
      payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    }
    return this.present(order, payment);
  }

  async list(ownerSubject: string) {
    const orders = await this.prisma.paymentOrder.findMany({ where: { ownerSubject }, include: { payment: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { items: orders.filter((entry) => entry.payment).map((entry) => this.present(entry, entry.payment!)) };
  }

  async get(ownerSubject: string, paymentId: string) {
    const id = validUuid(paymentId, 'Le paiement');
    const order = await this.prisma.paymentOrder.findFirst({ where: { ownerSubject, payment: { id } }, include: { payment: true } });
    if (!order?.payment) throw new NotFoundException('Paiement introuvable.');
    return this.present(order, order.payment);
  }

  private present(order: { id: string; packId: string; packKey: string; packName: string; credits: number; amountMinor: number; currency: string; priceScheduleVersion: number; status: string; createdAt: Date }, payment: { id: string; provider: string; status: string; checkoutUrl: string | null; providerTransactionId: string | null; providerRefundId: string | null; failureCode: string | null; paidAt: Date | null; createdAt: Date }) {
    return { id: payment.id, status: payment.status, provider: payment.provider, checkoutUrl: payment.checkoutUrl, providerTransactionId: payment.providerTransactionId, providerRefundId: payment.providerRefundId, failureCode: payment.failureCode, paidAt: payment.paidAt, createdAt: payment.createdAt, order: { id: order.id, status: order.status, packId: order.packId, packKey: order.packKey, packName: order.packName, credits: order.credits, amountMinor: order.amountMinor, currency: order.currency, priceScheduleVersion: order.priceScheduleVersion, createdAt: order.createdAt }, mockConfirmationAvailable: payment.provider === 'mock' && process.env['NODE_ENV'] !== 'production' && ['PENDING', 'PROCESSING'].includes(payment.status) };
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
    const result = await this.provider.refundPayment(payment.id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`);
      const current = await tx.payment.findUniqueOrThrow({ where: { id }, include: { order: true } });
      if (current.status === 'REFUNDED') return current;
      if (current.status !== 'SUCCEEDED') throw new ConflictException('Le paiement a changé de statut pendant le remboursement.');
      await tx.payment.update({ where: { id }, data: { status: result.status, providerRefundId: result.providerRefundId } });
      if (result.status === 'REFUNDED') {
        await tx.paymentOrder.update({ where: { id: current.orderId }, data: { status: 'REFUNDED' } });
        await tx.outboxMessage.create({ data: { eventType: 'payment.refunded.v1', aggregateId: id, payload: { paymentId: id, orderId: current.orderId, ownerSubject: current.order.ownerSubject, credits: current.order.credits, amountMinor: current.order.amountMinor, currency: current.order.currency, provider: current.provider, providerRefundId: result.providerRefundId } } });
      }
      return tx.payment.findUniqueOrThrow({ where: { id }, include: { order: true } });
    });
    return this.present(updated.order, updated);
  }

  async adminPayments(input: { provider?: string; limit?: string; cursor?: string }) {
    const provider = input.provider?.toLowerCase();
    if (provider && !['mock', 'flexpay', 'cinetpay'].includes(provider)) throw new BadRequestException('Le fournisseur de paiement est invalide.');
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
        if (payment.status === newStatus) return;
        const now = new Date();
        await tx.payment.update({ where: { id: paymentId }, data: { status: newStatus, providerTransactionId: newStatus === 'SUCCEEDED' ? confirmation.transactionId : payment.providerTransactionId, paidAt: newStatus === 'SUCCEEDED' ? (payment.paidAt ?? now) : null, failureCode: newStatus === 'FAILED' ? 'provider_declined' : null } });
        if (newStatus === 'SUCCEEDED') {
          await tx.paymentOrder.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
          await tx.outboxMessage.create({ data: { eventType: 'payment.succeeded.v1', aggregateId: payment.id, payload: { paymentId: payment.id, orderId: payment.orderId, ownerSubject: payment.order.ownerSubject, credits: payment.order.credits, amountMinor: payment.order.amountMinor, currency: payment.order.currency, provider: providerName, providerTransactionId: confirmation.transactionId, priceScheduleVersion: payment.order.priceScheduleVersion } } });
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

  async reconcile() {
    const cutoff = new Date(Date.now() - 60_000);
    const payments = await this.prisma.payment.findMany({ where: { provider: this.provider.name, status: { in: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'] }, OR: [{ reconciliationAttemptAt: null }, { reconciliationAttemptAt: { lt: cutoff } }] }, include: { order: true }, orderBy: [{ reconciliationAttemptAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }], take: 10 });
    for (const payment of payments) {
      const leasedAt = new Date();
      const lease = await this.prisma.payment.updateMany({ where: { id: payment.id, OR: [{ reconciliationAttemptAt: null }, { reconciliationAttemptAt: { lt: cutoff } }] }, data: { reconciliationAttemptAt: leasedAt } });
      if (!lease.count) continue;
      let confirmation: ProviderConfirmation | null;
      try { confirmation = await this.provider.getStatus(payment.id); }
      catch { continue; }
      if (!confirmation) continue;
      if (confirmation.reference !== payment.id) {
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
      const isAligned = (internalPaid && confirmation.status === 'SUCCEEDED') || (internalFailed && confirmation.status === 'FAILED') || (internalOpen && confirmation.status === 'PROCESSING');
      if (isAligned) {
        await this.resolveAnomalies(payment.id);
      } else if ((internalOpen || internalFailed) && confirmation.status === 'SUCCEEDED') {
        await this.applyConfirmation(this.provider.name, createHash('sha256').update(`reconcile:${payment.id}:${confirmation.providerStatus}`).digest('hex'), confirmation);
        await this.resolveAnomalies(payment.id);
      } else if (internalOpen && confirmation.status === 'FAILED') {
        await this.applyConfirmation(this.provider.name, createHash('sha256').update(`reconcile:${payment.id}:${confirmation.providerStatus}`).digest('hex'), confirmation);
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
