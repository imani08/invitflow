import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { FlexPayProvider } from './flexpay.provider.js';

const names = ['FLEXPAY_ENV', 'FLEXPAY_BASE_URL', 'FLEXPAY_MERCHANT_CODE', 'FLEXPAY_AUTH_TOKEN', 'FLEXPAY_CALLBACK_URL', 'FLEXPAY_RETURN_URL'] as const;
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
after(() => {
  for (const name of names) {
    const value = previous[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

function configureFlexPay() {
  process.env['FLEXPAY_ENV'] = 'sandbox';
  process.env['FLEXPAY_BASE_URL'] = 'https://sandbox.example.invalid';
  process.env['FLEXPAY_MERCHANT_CODE'] = 'merchant-test';
  process.env['FLEXPAY_AUTH_TOKEN'] = 'test-token-not-a-real-secret';
  process.env['FLEXPAY_CALLBACK_URL'] = 'https://app.example.invalid/v1/payments/webhooks/flexpay';
  process.env['FLEXPAY_RETURN_URL'] = 'https://app.example.invalid/account/wallet';
}

test('requires complete non-placeholder configuration when selected', () => {
  for (const name of names) delete process.env[name];
  assert.throws(() => new FlexPayProvider(), /requires valid configuration/);
  configureFlexPay();
  process.env['FLEXPAY_AUTH_TOKEN'] = 'CHANGE_ME';
  assert.throws(() => new FlexPayProvider(), /FLEXPAY_AUTH_TOKEN/);
});

test('fails closed instead of pretending to create a FlexPay checkout without the official contract', async () => {
  configureFlexPay();
  const provider = new FlexPayProvider();
  await assert.rejects(provider.createPayment({ id: 'payment-id', amountMinor: 100, currency: 'USD', packName: 'Pack', ownerSubject: 'user-id' }), (error: unknown) => error instanceof ServiceUnavailableException);
  await assert.rejects(provider.verifyPayment({ headers: {}, body: {} }), (error: unknown) => error instanceof ServiceUnavailableException);
  await assert.rejects(provider.getStatus('payment-id'), (error: unknown) => error instanceof ServiceUnavailableException);
  await assert.rejects(provider.refundPayment('payment-id'), (error: unknown) => error instanceof ServiceUnavailableException);
});
