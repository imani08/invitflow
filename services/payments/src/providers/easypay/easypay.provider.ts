import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PaymentProvider, PaymentSnapshot, ProviderCheckout, ProviderConfirmation, ProviderRefund } from '../../payment-provider.js';

type EasyPayConfig = { environment: 'sandbox'; baseUrl: string; cid: string; token: string; ipnUrl: string };
type ProviderObject = Record<string, unknown>;
const RESPONSE_LIMIT = 64 * 1024;

function record(value: unknown): ProviderObject | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as ProviderObject : undefined; }
function responseObjects(value: unknown): ProviderObject[] {
  const root = record(value);
  if (!root) return [];
  return [root, record(root['payment']), record(root['transaction'])].filter((entry): entry is ProviderObject => !!entry);
}
function stringField(objects: ProviderObject[], ...names: string[]) {
  for (const object of objects) for (const name of names) if (typeof object[name] === 'string' && (object[name] as string).trim()) return (object[name] as string).trim();
  return undefined;
}
function decimalMinor(value: unknown): number | undefined {
  const source = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(source);
  if (!match) return undefined;
  const whole = Number(match[1]); const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const result = whole * 100 + fraction;
  return Number.isSafeInteger(result) ? result : undefined;
}
function majorAmount(amountMinor: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new BadRequestException('Le montant du paiement doit être un entier positif en unités mineures.');
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
}
export function mapProviderStatus(value: string): ProviderConfirmation['status'] {
  switch (value.trim().toUpperCase()) {
    case 'PAID': case 'SUCCESS': case 'SUCCEEDED': return 'SUCCEEDED';
    case 'FAILED': case 'FAILURE': return 'FAILED';
    case 'CANCELLED': case 'CANCELED': return 'CANCELLED';
    case 'EXPIRED': return 'EXPIRED';
    default: return 'PROCESSING';
  }
}

@Injectable()
export class EasyPayProvider implements PaymentProvider {
  readonly name = 'easypay';
  private readonly config = this.loadConfig();

  private loadConfig(): EasyPayConfig {
    const environment = (process.env['EASYPAY_ENV'] ?? 'sandbox').trim();
    if (environment !== 'sandbox') throw new Error('EASYPAY_ENV must remain sandbox during the EasyPay integration phase');
    const baseRaw = (process.env['EASYPAY_BASE_URL'] ?? 'https://www.e-com-easypay.com').trim();
    const cid = process.env['EASYPAY_CID']?.trim() ?? '';
    const token = process.env['EASYPAY_TOKEN']?.trim() ?? '';
    const ipnRaw = process.env['EASYPAY_IPN_URL']?.trim() ?? '';
    if (!cid || !token || cid === 'CHANGE_ME' || token === 'CHANGE_ME') throw new Error('PAYMENT_PROVIDER=easypay requires EASYPAY_CID and EASYPAY_TOKEN');
    let base: URL; let ipn: URL;
    try { base = new URL(baseRaw); ipn = new URL(ipnRaw); }
    catch { throw new Error('EasyPay base and IPN URLs must be valid absolute URLs'); }
    if (base.protocol !== 'https:' || base.hostname !== 'www.e-com-easypay.com' || base.pathname !== '/' || base.search || base.hash) throw new Error('EasyPay base URL must be the documented HTTPS host');
    if (ipn.protocol !== 'https:' || ipn.username || ipn.password || ipn.hash) throw new Error('EASYPAY_IPN_URL must be an absolute public HTTPS URL');
    const expectedPath = '/api/payments/providers/easypay/ipn';
    if (ipn.pathname !== expectedPath) throw new Error(`EASYPAY_IPN_URL must end in ${expectedPath}`);
    return { environment, baseUrl: base.origin, cid, token, ipnUrl: ipn.toString() };
  }

  createOrderReference(): string { return randomBytes(8).toString('hex').toUpperCase(); }

  validateCheckout(amountMinor: number, currency: string) {
    majorAmount(amountMinor);
    if (currency !== 'USD' && currency !== 'CDF') throw new BadRequestException('EasyPay accepte uniquement USD et CDF pour cette intégration.');
  }

  async createPayment(payment: PaymentSnapshot): Promise<ProviderCheckout> {
    if (!payment.providerOrderRef || !/^[A-Z0-9]{6,16}$/.test(payment.providerOrderRef)) throw new BadRequestException('La référence marchande EasyPay est invalide.');
    this.validateCheckout(payment.amountMinor, payment.currency);
    if (!payment.customerName?.trim() || payment.customerName.trim().length > 120) throw new BadRequestException('Le nom du payeur est requis pour EasyPay.');
    const endpoint = new URL(`/${this.config.environment}/payment/initialization`, this.config.baseUrl);
    endpoint.searchParams.set('cid', this.config.cid);
    endpoint.searchParams.set('token', this.config.token);
    const channels: Record<NonNullable<PaymentSnapshot['channel']>, { channel: string }[]> = {
      CARD_ONLY: [{ channel: 'CREDIT CARD' }],
      MOBILE_MONEY_ONLY: [{ channel: 'MOBILE MONEY' }],
      CARD_AND_MOBILE_MONEY: [{ channel: 'CREDIT CARD' }, { channel: 'MOBILE MONEY' }],
    };
    const body = {
      order_ref: payment.providerOrderRef,
      amount: majorAmount(payment.amountMinor),
      currency: payment.currency,
      description: payment.packName.slice(0, 160),
      success_url: payment.successUrl,
      error_url: payment.errorUrl,
      cancel_url: payment.cancelUrl,
      language: payment.language === 'EN' ? 'EN' : 'FR',
      channels: channels[payment.channel ?? 'CARD_AND_MOBILE_MONEY'],
      customer_name: payment.customerName.trim(),
      ...(payment.customerEmail ? { customer_email: payment.customerEmail } : {}),
      ipn_url: payment.ipnUrl ?? this.config.ipnUrl,
    };
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    } catch {
      console.info(JSON.stringify({ event: 'payment_provider_initialize_failed', paymentId: payment.id, provider: this.name, providerOrderRef: payment.providerOrderRef, reason: 'network_or_timeout', latencyMs: Date.now() - startedAt }));
      throw new ServiceUnavailableException('EasyPay n’a pas pu répondre à la demande. Vérifiez le statut avant de réessayer.');
    }
    const payload = await this.readJson(response);
    const providerReference = stringField(responseObjects(payload), 'reference');
    console.info(JSON.stringify({ event: 'payment_provider_initialized', paymentId: payment.id, provider: this.name, providerOrderRef: payment.providerOrderRef, providerHttpStatus: response.status, latencyMs: Date.now() - startedAt }));
    if (!response.ok || !providerReference || providerReference.length > 255) throw new BadGatewayException('EasyPay n’a pas retourné une référence de paiement valide.');
    const checkout = new URL(`/${this.config.environment}/payment/initialization`, this.config.baseUrl);
    checkout.searchParams.set('reference', providerReference);
    return { checkoutUrl: checkout.toString(), providerReference };
  }

  extractNotificationReference(body: unknown): string {
    const objects = responseObjects(body);
    const value = stringField(objects, 'reference', 'order_ref');
    if (!value || value.length > 255 || /[\u0000-\u001f]/.test(value)) throw new BadRequestException('Notification EasyPay invalide.');
    return value;
  }

  async verifyPayment(): Promise<ProviderConfirmation> {
    throw new ServiceUnavailableException('EasyPay IPN must be verified through checking-status.');
  }

  async getStatus(providerReference: string): Promise<ProviderConfirmation | null> {
    if (!providerReference || providerReference.length > 255 || /[\u0000-\u0020]/.test(providerReference)) throw new BadRequestException('La référence EasyPay est invalide.');
    return this.checkingStatus(providerReference);
  }

  private async checkingStatus(providerReference: string): Promise<ProviderConfirmation | null> {
    // The method is isolated here because the local integration notes do not settle it; confirm GET in sandbox.
    const url = new URL(`/${this.config.environment}/payment/${encodeURIComponent(providerReference)}/checking-status`, this.config.baseUrl);
    const startedAt = Date.now();
    let response: Response;
    try { response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
    catch { throw new ServiceUnavailableException('La vérification EasyPay est momentanément indisponible.'); }
    const payload = await this.readJson(response);
    console.info(JSON.stringify({ event: 'payment_provider_status_checked', provider: this.name, providerReference, providerHttpStatus: response.status, latencyMs: Date.now() - startedAt }));
    if (response.status === 404) return null;
    if (!response.ok) throw new ServiceUnavailableException('EasyPay n’a pas pu vérifier ce paiement.');
    const objects = responseObjects(payload);
    const rawStatus = stringField(objects, 'status');
    const returnedReference = stringField(objects, 'reference');
    const orderRef = stringField(objects, 'order_ref');
    const currency = stringField(objects, 'currency')?.toUpperCase();
    let amountMinor: number | undefined;
    for (const object of objects) if (object['amount'] !== undefined) { amountMinor = decimalMinor(object['amount']); break; }
    if (!rawStatus || !returnedReference || !currency || amountMinor === undefined) throw new BadGatewayException('La réponse de vérification EasyPay ne contient pas les champs requis.');
    if (!['USD', 'CDF'].includes(currency)) throw new BadGatewayException('EasyPay a retourné une devise non prise en charge.');
    return { reference: returnedReference, providerReference: returnedReference, ...(orderRef ? { providerOrderRef: orderRef } : {}), transactionId: stringField(objects, 'transaction_id', 'transactionId') ?? returnedReference, status: mapProviderStatus(rawStatus), providerStatus: rawStatus.slice(0, 80), amountMinor, currency };
  }

  private async readJson(response: Response): Promise<unknown> {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > RESPONSE_LIMIT) throw new BadGatewayException('Réponse EasyPay trop volumineuse.');
    const text = await response.text();
    if (text.length > RESPONSE_LIMIT) throw new BadGatewayException('Réponse EasyPay trop volumineuse.');
    try { return JSON.parse(text) as unknown; } catch { throw new BadGatewayException('EasyPay a retourné une réponse JSON invalide.'); }
  }

  async refundPayment(): Promise<ProviderRefund> {
    throw new ServiceUnavailableException('Le remboursement EasyPay reste désactivé jusqu’à confirmation du contrat marchand.');
  }
}
