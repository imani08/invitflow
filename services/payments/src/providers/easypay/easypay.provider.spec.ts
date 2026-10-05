import assert from 'node:assert/strict';
import test from 'node:test';
import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { EasyPayProvider, mapProviderStatus } from './easypay.provider.js';

const config = {
  EASYPAY_ENV: 'sandbox', EASYPAY_BASE_URL: 'https://www.e-com-easypay.com', EASYPAY_CID: 'sandbox-cid',
  EASYPAY_TOKEN: 'sandbox-token-not-a-secret', EASYPAY_IPN_URL: 'https://checkout.example.invalid/api/payments/providers/easypay/ipn',
};
const payment = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerSubject: 'owner', amountMinor: 1234, currency: 'USD', packName: 'Credits',
  providerOrderRef: 'A1B2C3D4E5F6G7H8', customerName: 'Test Customer', customerEmail: 'sandbox@example.invalid', channel: 'CARD_AND_MOBILE_MONEY' as const,
  language: 'FR' as const, successUrl: 'https://app.example.invalid/payments/result/success?paymentId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  cancelUrl: 'https://app.example.invalid/payments/result/cancel?paymentId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  errorUrl: 'https://app.example.invalid/payments/result/error?paymentId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

async function configured(run: () => Promise<void>) {
  const prior = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  try { await run(); }
  finally { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('EasyPay initializes from the server with exact money, merchant reference, channel and safe checkout URL', async () => configured(async () => {
  const oldFetch = globalThis.fetch;
  let calledUrl = '';
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    calledUrl = String(input); requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(init?.method, 'POST');
    return Response.json({ code: 'OK', reference: 'provider-ref-123', message: 'created' });
  };
  try {
    const provider = new EasyPayProvider();
    const result = await provider.createPayment(payment);
    const url = new URL(calledUrl);
    assert.equal(url.pathname, '/sandbox/payment/initialization');
    assert.equal(url.searchParams.get('cid'), config.EASYPAY_CID);
    assert.equal(url.searchParams.get('token'), config.EASYPAY_TOKEN);
    assert.equal(requestBody?.['order_ref'], payment.providerOrderRef);
    assert.equal(requestBody?.['amount'], '12.34');
    assert.equal(requestBody?.['currency'], 'USD');
    assert.deepEqual(requestBody?.['channels'], [{ channel: 'CREDIT CARD' }, { channel: 'MOBILE MONEY' }]);
    assert.equal(requestBody?.['customer_name'], 'Test Customer');
    assert.equal(requestBody?.['customer_email'], 'sandbox@example.invalid');
    const checkout = new URL(result.checkoutUrl!);
    assert.equal(checkout.origin, 'https://www.e-com-easypay.com');
    assert.equal(checkout.pathname, '/sandbox/payment/initialization');
    assert.equal(checkout.searchParams.get('reference'), 'provider-ref-123');
    assert.equal(result.providerReference, 'provider-ref-123');
  } finally { globalThis.fetch = oldFetch; }
}));

test('channel, currencies, minor units and unique merchant order references are constrained', async () => configured(async () => {
  const oldFetch = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => { bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return Response.json({ payment: { reference: 'ref-' + bodies.length } }); };
  try {
    const provider = new EasyPayProvider();
    provider.validateCheckout(1, 'CDF');
    assert.throws(() => provider.validateCheckout(0, 'USD'), BadRequestException);
    assert.throws(() => provider.validateCheckout(100, 'EUR'), BadRequestException);
    for (const [channel, expected] of [
      ['CARD_ONLY', [{ channel: 'CREDIT CARD' }]], ['MOBILE_MONEY_ONLY', [{ channel: 'MOBILE MONEY' }]],
    ] as const) {
      await provider.createPayment({ ...payment, channel, currency: 'CDF' });
      assert.deepEqual(bodies.at(-1)?.['channels'], expected);
    }
    const refs = Array.from({ length: 100 }, () => provider.createOrderReference!());
    assert.equal(new Set(refs).size, refs.length);
    assert.ok(refs.every(value => /^[A-Z0-9]{6,16}$/.test(value)));
  } finally { globalThis.fetch = oldFetch; }
}));

test('initialization failures, invalid shapes, and network timeout are never retried or treated as success', async () => configured(async () => {
  const oldFetch = globalThis.fetch;
  try {
    const provider = new EasyPayProvider();
    globalThis.fetch = async () => Response.json({ message: 'declined' }, { status: 400 });
    await assert.rejects(provider.createPayment(payment), BadGatewayException);
    globalThis.fetch = async () => new Response('<html>invalid</html>', { status: 200 });
    await assert.rejects(provider.createPayment(payment), BadGatewayException);
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    await assert.rejects(provider.createPayment(payment), ServiceUnavailableException);
  } finally { globalThis.fetch = oldFetch; }
}));

test('checking-status is isolated as GET, parses amounts exactly, maps statuses and leaves unknown values pending', async () => configured(async () => {
  const oldFetch = globalThis.fetch;
  let method = '';
  globalThis.fetch = async (_input, init) => {
    method = String(init?.method);
    return Response.json({ payment: { reference: 'provider-ref-123', order_ref: payment.providerOrderRef, amount: '12.34', currency: 'USD', status: 'PAID', transaction_id: 'txn-1' } });
  };
  try {
    const provider = new EasyPayProvider();
    const paid = await provider.getStatus('provider-ref-123');
    assert.equal(method, 'GET');
    assert.equal(paid?.amountMinor, 1234);
    assert.equal(paid?.status, 'SUCCEEDED');
    assert.equal(paid?.providerOrderRef, payment.providerOrderRef);
    assert.equal(paid?.transactionId, 'txn-1');
    assert.equal(mapProviderStatus('PENDING'), 'PROCESSING');
    assert.equal(mapProviderStatus('FAILED'), 'FAILED');
    assert.equal(mapProviderStatus('an undocumented value'), 'PROCESSING');
    globalThis.fetch = async () => Response.json({ reference: 'ref', amount: 1.001, currency: 'USD', status: 'PAID' });
    await assert.rejects(provider.getStatus('ref'), BadGatewayException);
    globalThis.fetch = async () => Response.json({ reference: 'ref', amount: '1.00', currency: 'USD', status: 'PAID' }, { status: 404 });
    assert.equal(await provider.getStatus('ref'), null);
  } finally { globalThis.fetch = oldFetch; }
}));

test('IPN parser extracts only a bounded reference and never trusts the supplied status', async () => configured(async () => {
  const provider = new EasyPayProvider();
  assert.equal(provider.extractNotificationReference({ order_ref: payment.providerOrderRef, status: 'SUCCESS', amount: '0.01' }), payment.providerOrderRef);
  assert.equal(provider.extractNotificationReference({ reference: 'provider-ref-123', status: 'FAILED' }), 'provider-ref-123');
  assert.throws(() => provider.extractNotificationReference({ status: 'SUCCESS' }), BadRequestException);
  assert.throws(() => provider.extractNotificationReference({ reference: 'x'.repeat(300) }), BadRequestException);
}));
