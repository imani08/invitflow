import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentsService } from './payments.service.js';
import type { PrismaService } from './prisma.service.js';

const paymentId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const partnerId = '33333333-3333-4333-8333-333333333333';
const attributionId = '44444444-4444-4444-8444-444444444444';

function harness(withAttribution = true) {
  const payment: Record<string, unknown> = {
    id: paymentId, orderId, provider: 'mock', status: 'PROCESSING', providerTransactionId: null, paidAt: null,
    order: { id: orderId, orderType: 'CREDIT_PURCHASE', ownerSubject: 'customer', amountMinor: 10000, currency: 'USD', credits: 50, status: 'CREATED' },
  };
  const ledger: Array<Record<string, unknown>> = [];
  const tx = {
    webhookReceipt: { create: async () => ({}) },
    $queryRaw: async () => [],
    payment: { findUnique: async () => payment, update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(payment, data) },
    paymentOrder: { update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(payment['order'] as object, data) },
    referralAttribution: { findUnique: async () => withAttribution ? { id: attributionId, partnerId, status: 'ACTIVE', partner: { id: partnerId, ownerSubject: 'partner-owner', status: 'ACTIVE', commissionRateBps: 750, eligibleOrderTypes: ['CREDIT_PURCHASE'] } } : null },
    commissionLedgerEntry: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { for (const row of data) if (!ledger.some((entry) => (row['originalPaymentId'] && entry['originalPaymentId'] === row['originalPaymentId']) || (row['originalEntryId'] && entry['originalEntryId'] === row['originalEntryId']))) ledger.push(row); return { count: ledger.length }; },
      findUnique: async () => ledger.find((entry) => entry['originalPaymentId'] === paymentId) ?? null,
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(ledger[0]!, data); return ledger[0]; },
    },
    outboxMessage: { create: async () => ({}) },
  };
  const prisma = { $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx) } as unknown as PrismaService;
  const service = new PaymentsService(prisma);
  return { service, payment, ledger, tx };
}

test('eligible confirmed payment snapshots configured rate once across repeated success events', async () => {
  const { service, payment, ledger } = harness();
  const internal = service as unknown as { applyConfirmation(provider: string, hash: string, confirmation: unknown): Promise<void> };
  const confirmation = { reference: paymentId, status: 'SUCCEEDED', transactionId: 'provider-tx', amountMinor: 10000, currency: 'USD', providerStatus: 'paid' };
  await internal.applyConfirmation('mock', 'event-1', confirmation);
  await internal.applyConfirmation('mock', 'event-2', confirmation);
  assert.equal(payment['status'], 'SUCCEEDED');
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.['commissionAmountMinor'], 750);
  assert.equal(ledger[0]?.['rateBpsSnapshot'], 750);
});

test('payment without an active attribution creates no commission', async () => {
  const { service, ledger } = harness(false);
  const internal = service as unknown as { applyConfirmation(provider: string, hash: string, confirmation: unknown): Promise<void> };
  await internal.applyConfirmation('mock', 'event-1', { reference: paymentId, status: 'SUCCEEDED', transactionId: 'provider-tx', amountMinor: 10000, currency: 'USD', providerStatus: 'paid' });
  assert.equal(ledger.length, 0);
});

test('refund reversal is immutable and idempotent', async () => {
  const { service, ledger, tx } = harness();
  ledger.push({ id: 'commission-1', partnerId, attributionId, paymentId, originalPaymentId: paymentId, orderId, status: 'PAID', orderType: 'CREDIT_PURCHASE', baseAmountMinor: 10000, commissionAmountMinor: 750, rateBpsSnapshot: 750, currency: 'USD' });
  const internal = service as unknown as { reversePartnerCommission(client: typeof tx, id: string): Promise<void> };
  await internal.reversePartnerCommission(tx, paymentId);
  await internal.reversePartnerCommission(tx, paymentId);
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0]?.['status'], 'PAID');
  assert.equal(ledger[1]?.['commissionAmountMinor'], -750);
  assert.equal(ledger[1]?.['originalEntryId'], 'commission-1');
});
