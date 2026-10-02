import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentsService } from './payments.service.js';

const packId = '8e7fa4c2-bd22-4c5a-9847-920cd0ea9101';
const scheduleId = '5e7fa4c2-bd22-4c5a-9847-920cd0ea9101';

function quote(overrides: Record<string, unknown> = {}) {
  return {
    orderType: 'CREDIT_PURCHASE', packId, packKey: 'starter', packName: 'Starter', quantity: 2, unitCredits: 50, credits: 100,
    currency: 'USD', unitPriceMinor: 1500, discountMinor: 0, discountRule: null,
    taxEnabled: false, taxRule: null, taxRateBps: 0, taxMinor: 0, subtotalMinor: 3000,
    totalMinor: 3000, priceScheduleId: scheduleId, priceScheduleVersion: 2,
    ...overrides,
  };
}

test('payment order persists the complete Billing quote snapshot and provider receives its total', async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalProvider = process.env['PAYMENT_PROVIDER'];
  process.env['NODE_ENV'] = 'test';
  process.env['PAYMENT_PROVIDER'] = 'mock';
  const saved: Record<string, unknown>[] = [];
  const payment = {
    id: 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', orderId: 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2',
    provider: 'mock', status: 'CREATED', checkoutUrl: null, providerTransactionId: null, providerRefundId: null,
    failureCode: null, paidAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  let storedOrder: Record<string, unknown> | null = null;
  const db = {
    paymentOrder: {
      findUnique: async () => storedOrder ? { ...storedOrder, payment } : null,
    },
    payment: {
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ ...payment, status: 'PENDING' }),
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      paymentOrder: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          saved.push(data);
          storedOrder = { id: payment.orderId, status: 'CREATED', createdAt: new Date(), ...data };
          return storedOrder;
        },
        findUniqueOrThrow: async () => ({ ...storedOrder, payment }),
      },
      payment: { create: async () => payment },
      outboxMessage: { create: async () => ({ id: 'outbox' }) },
    }),
  };
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), { packId, quantity: 2, orderType: 'CREDIT_PURCHASE' });
    return Response.json(quote());
  };
  try {
    const service = new PaymentsService(db as never);
    const result = await service.create('owner', 'Bearer token', 'checkout-key', { packId, quantity: 2 });
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.['unitPriceMinor'], 1500);
    assert.equal(saved[0]?.['orderType'], 'CREDIT_PURCHASE');
    assert.equal(saved[0]?.['quantity'], 2);
    assert.equal(saved[0]?.['discountMinor'], 0);
    assert.equal(saved[0]?.['discountRule'], null);
    assert.equal(saved[0]?.['taxMinor'], 0);
    assert.equal(saved[0]?.['subtotalMinor'], 3000);
    assert.equal(saved[0]?.['totalMinor'], 3000);
    assert.equal(saved[0]?.['amountMinor'], 3000);
    assert.equal(result.order.totalMinor, 3000);
    assert.equal(result.order.priceScheduleVersion, 2);
    assert.equal(result.order.priceScheduleId, scheduleId);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = originalNodeEnv;
    if (originalProvider === undefined) delete process.env['PAYMENT_PROVIDER']; else process.env['PAYMENT_PROVIDER'] = originalProvider;
  }
});

test('Billing quote arithmetic is validated before an order is persisted', async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalProvider = process.env['PAYMENT_PROVIDER'];
  process.env['NODE_ENV'] = 'test';
  process.env['PAYMENT_PROVIDER'] = 'mock';
  let writes = 0;
  const db = {
    paymentOrder: { findUnique: async () => null },
    $transaction: async () => { writes += 1; },
  };
  globalThis.fetch = async () => Response.json(quote({ totalMinor: 1 }));
  try {
    const service = new PaymentsService(db as never);
    await assert.rejects(service.create('owner', 'Bearer token', 'bad-quote-key', { packId, quantity: 2 }), /invariants de calcul/);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = originalNodeEnv;
    if (originalProvider === undefined) delete process.env['PAYMENT_PROVIDER']; else process.env['PAYMENT_PROVIDER'] = originalProvider;
  }
});

test('agency checkout rejects any Billing period other than the fixed 30 days', async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalProvider = process.env['PAYMENT_PROVIDER'];
  process.env['NODE_ENV'] = 'test'; process.env['PAYMENT_PROVIDER'] = 'mock';
  let writes = 0;
  const db = { paymentOrder: { findUnique: async () => null }, $transaction: async () => { writes += 1; } };
  globalThis.fetch = async () => Response.json(quote({ orderType: 'AGENCY_SUBSCRIPTION', periodDays: 31, quantity: 1, unitCredits: 50, credits: 50, subtotalMinor: 1500, totalMinor: 1500 }));
  try {
    const service = new PaymentsService(db as never);
    await assert.rejects(service.create('owner', 'Bearer token', 'agency-bad-period', { packId, quantity: 1, orderType: 'AGENCY_SUBSCRIPTION', businessReference: 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2', expectedPriceScheduleId: scheduleId, expectedPriceScheduleVersion: 2 }), /invariants de calcul/);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = originalNodeEnv;
    if (originalProvider === undefined) delete process.env['PAYMENT_PROVIDER']; else process.env['PAYMENT_PROVIDER'] = originalProvider;
  }
});
