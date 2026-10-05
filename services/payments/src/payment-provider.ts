import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FlexPayProvider } from './providers/flexpay/flexpay.provider.js';
import { EasyPayProvider } from './providers/easypay/easypay.provider.js';

export type PaymentChannel = 'CARD_ONLY' | 'MOBILE_MONEY_ONLY' | 'CARD_AND_MOBILE_MONEY';
export type PaymentLanguage = 'FR' | 'EN';
export type PaymentSnapshot = {
  id: string; amountMinor: number; currency: string; packName: string; ownerSubject: string;
  providerOrderRef?: string; customerName?: string; customerEmail?: string; channel?: PaymentChannel;
  language?: PaymentLanguage; successUrl?: string; cancelUrl?: string; errorUrl?: string; ipnUrl?: string;
};
export type ProviderCheckout = { checkoutUrl: string | null; providerReference: string | null };
export type ProviderConfirmation = { reference: string; transactionId: string; status: 'SUCCEEDED' | 'FAILED' | 'PROCESSING' | 'CANCELLED' | 'EXPIRED'; providerStatus: string; amountMinor: number; currency: string; providerOrderRef?: string; providerReference?: string };
export type ProviderRefund = { status: 'REFUND_PENDING' | 'REFUNDED'; providerRefundId: string | null };

export interface PaymentProvider {
  readonly name: string;
  createOrderReference?(): string;
  extractNotificationReference?(body: unknown): string;
  validateCheckout?(amountMinor: number, currency: string): void;
  createPayment(payment: PaymentSnapshot): Promise<ProviderCheckout>;
  verifyPayment(request: { headers: Record<string, string | string[] | undefined>; body: unknown }): Promise<ProviderConfirmation>;
  getStatus(transactionId: string): Promise<ProviderConfirmation | null>;
  refundPayment(paymentId: string): Promise<ProviderRefund>;
}

function header(headers: Record<string, string | string[] | undefined>, name: string) {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(found) ? found[0] : found;
}

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly webhookSecret = randomBytes(32);
  createPayment(): Promise<ProviderCheckout> { return Promise.resolve({ checkoutUrl: null, providerReference: null }); }
  createNotification(payment: PaymentSnapshot) {
    const body = { reference: payment.id, transactionId: `mock-${payment.id}`, status: 'SUCCESS', amountMinor: payment.amountMinor, currency: payment.currency };
    const serialized = JSON.stringify(body);
    if (typeof serialized !== 'string') throw new Error('Mock notification could not be serialized');
    const signature = createHmac('sha256', this.webhookSecret).update(serialized).digest('hex');
    return { headers: { 'x-mock-signature': signature }, body };
  }
  async verifyPayment(request: { headers: Record<string, string | string[] | undefined>; body: unknown }): Promise<ProviderConfirmation> {
    const supplied = header(request.headers, 'x-mock-signature');
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/i.test(supplied) || !request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new BadRequestException('Notification Mock Provider invalide.');
    const body = request.body as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    if (typeof serialized !== 'string') throw new BadRequestException('Notification Mock Provider invalide.');
    const expected = createHmac('sha256', this.webhookSecret).update(serialized).digest();
    const received = Buffer.from(supplied, 'hex');
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) throw new BadRequestException('Signature Mock Provider invalide.');
    if (typeof body['reference'] !== 'string' || typeof body['transactionId'] !== 'string' || !body['transactionId'].startsWith('mock-') || typeof body['currency'] !== 'string' || !Number.isSafeInteger(body['amountMinor']) || body['status'] !== 'SUCCESS') throw new BadRequestException('Données Mock Provider invalides.');
    return { reference: body['reference'], transactionId: body['transactionId'], providerStatus: 'SUCCESS', status: 'SUCCEEDED', amountMinor: body['amountMinor'] as number, currency: body['currency'] };
  }
  async getStatus(): Promise<ProviderConfirmation | null> { return null; }
  async refundPayment(paymentId: string): Promise<ProviderRefund> { return { status: 'REFUNDED', providerRefundId: `mock-refund-${paymentId}` }; }
}

export function selectedProvider(): PaymentProvider {
  const selected = process.env['PAYMENT_PROVIDER'] ?? 'mock';
  if (selected === 'mock') {
    if (process.env['NODE_ENV'] === 'production') throw new Error('PAYMENT_PROVIDER=mock is forbidden in production');
    return new MockPaymentProvider();
  }
  if (selected === 'flexpay') return new FlexPayProvider();
  if (selected === 'easypay') return new EasyPayProvider();
  throw new Error(`Unsupported PAYMENT_PROVIDER: ${selected}`);
}
