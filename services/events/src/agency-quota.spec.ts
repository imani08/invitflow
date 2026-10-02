import assert from 'node:assert/strict';
import test from 'node:test';
import { EventsService } from './events.service.js';
import type { PrismaService } from './prisma.service.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const subscriptionId = '33333333-3333-4333-8333-333333333333';

function quotaHarness(quotaCredits: number) {
  let used = Promise.resolve();
  const reservations = new Map<string, Record<string, unknown>>();
  const subscription = { id: subscriptionId, workspaceId, quotaCredits, status: 'ACTIVE', createdAt: new Date(), startsAt: new Date(Date.now() - 1000), billingPeriodEnd: new Date(Date.now() + 30 * 86_400_000) };
  const tx = {
    $queryRaw: async () => [],
    agencyMembership: { findFirst: async () => ({ role: 'OWNER' }) },
    agencySubscription: { findFirst: async ({ where }: { where: { billingPeriodEnd?: { gt: Date } } }) => where.billingPeriodEnd && subscription.billingPeriodEnd > where.billingPeriodEnd.gt ? subscription : null, updateMany: async () => ({ count: 0 }) },
    event: { findFirst: async ({ where }: { where: { id: string; agencyWorkspaceId: string } }) => where.id === eventId && where.agencyWorkspaceId === workspaceId ? { id: eventId } : null },
    agencyQuotaReservation: {
      findUnique: async ({ where }: { where: { referenceKey: string } }) => reservations.get(where.referenceKey) ?? null,
      aggregate: async ({ where }: { where: { subscriptionId: string; status: { in: string[] } } }) => ({ _sum: { credits: [...reservations.values()].filter((item) => item['subscriptionId'] === where.subscriptionId && where.status.in.includes(String(item['status']))).reduce((sum, item) => sum + Number(item['credits']), 0) } }),
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `reservation-${reservations.size + 1}`, ...data, createdAt: new Date(), updatedAt: new Date() }; reservations.set(String(data['referenceKey']), row); return row; },
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => { const row = [...reservations.values()].find((item) => item['id'] === where.id); if (!row || row['status'] !== where.status) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
      findUniqueOrThrow: async ({ where }: { where: { referenceKey: string } }) => reservations.get(where.referenceKey),
    },
    outboxMessage: { create: async ({ data }: { data: unknown }) => data },
  };
  const prisma = {
    agencyMembership: tx.agencyMembership,
    agencyQuotaReservation: tx.agencyQuotaReservation,
    agencySubscription: tx.agencySubscription,
    $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => {
      let unlock!: () => void;
      const previous = used;
      used = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      try { return await callback(tx); } finally { unlock(); }
    },
  };
  return { events: new EventsService(prisma as unknown as PrismaService), reservations, subscription };
}

test('agency quota reservation checks available, consumes once and releases failed work', async () => {
  const { events, reservations } = quotaHarness(5);
  const first = await events.reserveAgencyQuota('owner', workspaceId, eventId, 'batch-1', 3);
  assert.equal(first.remaining, 2);
  assert.equal((await events.reserveAgencyQuota('owner', workspaceId, eventId, 'batch-1', 3)).id, first.id);
  await events.finalizeAgencyQuotaReservation('owner', workspaceId, 'batch-1', 'CONSUMED');
  await events.finalizeAgencyQuotaReservation('owner', workspaceId, 'batch-1', 'CONSUMED');
  await assert.rejects(events.reserveAgencyQuota('owner', workspaceId, eventId, 'batch-too-large', 3), /Quota agence insuffisant/);
  await events.finalizeAgencyQuotaReservation('owner', workspaceId, 'batch-1', 'RELEASED').catch(() => undefined);
  assert.equal(reservations.get('batch-1')?.['status'], 'CONSUMED');
});

test('quota release frees capacity and same-reference retries do not double reserve', async () => {
  const { events, reservations } = quotaHarness(5);
  await events.reserveAgencyQuota('owner', workspaceId, eventId, 'failed-batch', 4);
  await events.finalizeAgencyQuotaReservation('owner', workspaceId, 'failed-batch', 'RELEASED');
  assert.equal(reservations.get('failed-batch')?.['status'], 'RELEASED');
  const next = await events.reserveAgencyQuota('owner', workspaceId, eventId, 'retry-new-reference', 4);
  assert.equal(next.remaining, 1);
});

test('concurrent agency reservations serialize against one subscription quota', async () => {
  const { events } = quotaHarness(5);
  const attempts = await Promise.allSettled([
    events.reserveAgencyQuota('owner', workspaceId, eventId, 'parallel-1', 4),
    events.reserveAgencyQuota('owner', workspaceId, eventId, 'parallel-2', 4),
  ]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1);
});

test('partial reservation returns exactly the concurrently available agency quota for Wallet fallback', async () => {
  const { events, reservations } = quotaHarness(5);
  await events.reserveAgencyQuota('owner', workspaceId, eventId, 'first', 4);
  const partial = await events.reserveAgencyQuota('owner', workspaceId, eventId, 'second', 4, true);
  assert.equal(partial.reservedCredits, 1);
  assert.equal(partial.remaining, 0);
  assert.equal(reservations.get('second')?.['credits'], 1);
});

test('agency quota reservation is refused at and after the exact period expiration', async () => {
  const { events, subscription } = quotaHarness(5);
  subscription.billingPeriodEnd = new Date(Date.now() - 1);
  await assert.rejects(events.reserveAgencyQuota('owner', workspaceId, eventId, 'expired-period', 1), /souscription agence active/);
});

test('a fresh agency period gets its full quota without carrying reservations from the expired period', async () => {
  const { events, reservations } = quotaHarness(1500);
  reservations.set('previous-period-consumption', { id: 'old-reservation', subscriptionId: '44444444-4444-4444-8444-444444444444', workspaceId, eventId, referenceKey: 'previous-period-consumption', credits: 1400, status: 'CONSUMED' });
  const summary = await events.agencyQuotaSummary('owner', workspaceId);
  assert.equal(summary.includedQuota, 1500);
  assert.equal(summary.consumed, 0);
  assert.equal(summary.reserved, 0);
  assert.equal(summary.remaining, 1500);
});
