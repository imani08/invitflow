import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PaymentProvider, PaymentSnapshot, ProviderCheckout, ProviderConfirmation, ProviderRefund } from '../../payment-provider.js';

type FlexPayConfiguration = {
  environment: 'sandbox' | 'production';
  merchantCode: string;
  authToken: string;
  baseUrl: string;
  callbackUrl: string;
  returnUrl: string;
};

@Injectable()
export class FlexPayProvider implements PaymentProvider {
  readonly name = 'flexpay';
  private readonly config = this.loadConfig();

  private loadConfig(): FlexPayConfiguration {
    const required = ['FLEXPAY_BASE_URL', 'FLEXPAY_MERCHANT_CODE', 'FLEXPAY_AUTH_TOKEN', 'FLEXPAY_CALLBACK_URL', 'FLEXPAY_RETURN_URL'] as const;
    const values = Object.fromEntries(required.map((name) => [name, process.env[name]?.trim() ?? ''])) as Record<(typeof required)[number], string>;
    const missing = required.filter((name) => !values[name] || values[name] === 'CHANGE_ME');
    const environment = process.env['FLEXPAY_ENV'] ?? 'sandbox';
    if (environment !== 'sandbox' && environment !== 'production') throw new Error('FLEXPAY_ENV must be sandbox or production');
    if (process.env['NODE_ENV'] === 'production' && environment !== 'production') throw new Error('FLEXPAY_ENV=sandbox is forbidden in production');
    if (missing.length) throw new Error(`PAYMENT_PROVIDER=flexpay requires valid configuration: ${missing.join(', ')}`);

    let base: URL; let callback: URL; let returnUrl: URL;
    try { base = new URL(values.FLEXPAY_BASE_URL); callback = new URL(values.FLEXPAY_CALLBACK_URL); returnUrl = new URL(values.FLEXPAY_RETURN_URL); }
    catch { throw new Error('FlexPay URLs are invalid'); }
    if (base.protocol !== 'https:' || callback.protocol !== 'https:' || (environment === 'production' && returnUrl.protocol !== 'https:')) throw new Error('FlexPay provider and callback URLs must use HTTPS; production return URL must also use HTTPS');
    if (environment === 'production' && [base.hostname, callback.hostname, returnUrl.hostname].some((hostname) => /localhost|127\.0\.0\.1|\.invalid$/i.test(hostname))) throw new Error('Local or placeholder URLs are forbidden for FlexPay production');
    return { environment, merchantCode: values.FLEXPAY_MERCHANT_CODE, authToken: values.FLEXPAY_AUTH_TOKEN, baseUrl: base.toString(), callbackUrl: callback.toString(), returnUrl: returnUrl.toString() };
  }

  validateCheckout(): void { this.assertContractAvailable(); }
  async createPayment(_payment: PaymentSnapshot): Promise<ProviderCheckout> { this.assertContractAvailable(); }
  async verifyPayment(_request: { headers: Record<string, string | string[] | undefined>; body: unknown }): Promise<ProviderConfirmation> { this.assertContractAvailable(); }
  async getStatus(_transactionId: string): Promise<ProviderConfirmation | null> { this.assertContractAvailable(); }
  async refundPayment(_paymentId: string): Promise<ProviderRefund> { this.assertContractAvailable(); }

  private assertContractAvailable(): never {
    // The official merchant API contract for FlexPay RDC is not available in this repository.
    // Do not guess endpoints, payload fields, signatures, status mapping, or refund semantics.
    void this.config;
    throw new ServiceUnavailableException('L’intégration FlexPay est suspendue jusqu’à validation du contrat API marchand officiel.');
  }
}
