import assert from 'node:assert/strict';
import test from 'node:test';
import { WalletService } from './wallet.service.js';
import { walletPaymentCommand } from './payment-event-routing.js';

function fakeWalletDatabase(initialAvailable = 0) {
  const wallet = { id: '11111111-1111-4111-8111-111111111111', ownerSubject: 'owner', availableCredits: initialAvailable, reservedCredits: 0, updatedAt: new Date() };
  const reservations = new Map<string, Record<string, unknown>>();
  const reservationsByKey = new Map<string, Record<string, unknown>>();
  const entries = new Map<string, Record<string, unknown>>();
  const outbox: Record<string, unknown>[] = [];
  let balanceWrites = 0;
  const findReservation = (where: Record<string, unknown>) => {
    if (typeof where['id'] === 'string') return [...reservations.values()].find((row) => row['id'] === where['id']) ?? null;
    if (typeof where['idempotencyKey'] === 'string') return reservationsByKey.get(where['idempotencyKey']) ?? null;
    const compound = where['walletId_referenceId'] as { walletId: string; referenceId: string } | undefined;
    return compound ? reservations.get(compound.referenceId) ?? null : null;
  };
  const client = {
    $queryRaw: async () => [],
    wallet: {
      upsert: async () => wallet,
      updateMany: async ({ data }: { data: { availableCredits: { increment: number }; reservedCredits: { increment: number } } }) => {
        balanceWrites += 1;
        const nextAvailable = wallet.availableCredits + data.availableCredits.increment;
        const nextReserved = wallet.reservedCredits + data.reservedCredits.increment;
        if (nextAvailable < 0 || nextReserved < 0) return { count: 0 };
        wallet.availableCredits = nextAvailable;
        wallet.reservedCredits = nextReserved;
        wallet.updatedAt = new Date();
        return { count: 1 };
      },
    },
    walletEntry: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => entries.get(where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `entry-${entries.size + 1}`, ...data };
        entries.set(String(data['idempotencyKey']), row);
        return row;
      },
    },
    walletReservation: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => findReservation(where),
      findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
        const row = findReservation(where);
        if (!row) throw new Error('reservation missing');
        return row;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `reservation-${reservations.size + 1}`, status: 'RESERVED', ...data };
        reservations.set(String(data['referenceId']), row);
        reservationsByKey.set(String(data['idempotencyKey']), row);
        return row;
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        const row = [...reservations.values()].find((entry) => entry['id'] === where.id);
        if (!row || row['status'] !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    outboxMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => { outbox.push(data); return data; },
    },
  };
  const db = {
    wallet: { upsert: async () => wallet },
    walletReservation: client.walletReservation,
    walletEntry: client.walletEntry,
    $transaction: async <T>(callback: (tx: typeof client) => Promise<T>) => callback(client),
  };
  return { db, wallet, reservations, entries, outbox, get balanceWrites() { return balanceWrites; } };
}

test('payment succeeded v1 and v2 credit-purchase messages credit once; agency subscriptions never reach wallet', async () => {
  const state = fakeWalletDatabase();
  const wallet = new WalletService(state.db as never);
  const paymentId = '55555555-5555-4555-8555-555555555555';
  const credit = { paymentId, customerSubject: 'owner', credits: 7, orderType: 'CREDIT_PURCHASE' };
  for (const eventType of ['payment.succeeded.v1', 'payment.succeeded.v2', 'payment.succeeded.v2']) {
    const command = walletPaymentCommand(eventType, credit);
    assert.ok(command && command.kind === 'CREDIT');
    await wallet.credit(command.ownerSubject, `payment:${command.paymentId}:purchase`, { type: 'PURCHASE', referenceId: command.paymentId, credits: command.credits });
  }
  assert.equal(state.wallet.availableCredits, 7);
  assert.equal(state.entries.size, 1);
  assert.equal(walletPaymentCommand('payment.succeeded.v2', { ...credit, orderType: 'AGENCY_SUBSCRIPTION' }), null);
});

test('reservation settles only the successful count and duplicate settlement never consumes twice', async () => {
  const state = fakeWalletDatabase(5);
  const wallet = new WalletService(state.db as never);
  const reference = 'invitation-batch/test-success';
  await wallet.reserve('owner', 'reserve-success', { credits: 3, referenceId: reference });
  assert.equal(state.wallet.availableCredits, 2);
  assert.equal(state.wallet.reservedCredits, 3);

  await wallet.settleReservation('owner', reference, 'settle-success', { consumedCredits: 2 });
  const writesAfterFirstSettlement = state.balanceWrites;
  await wallet.settleReservation('owner', reference, 'settle-success', { consumedCredits: 2 });
  assert.equal(state.wallet.availableCredits, 3);
  assert.equal(state.wallet.reservedCredits, 0);
  assert.equal(state.balanceWrites, writesAfterFirstSettlement);
  assert.equal(state.entries.get('settle-success')?.['metadata'] && (state.entries.get('settle-success')?.['metadata'] as Record<string, unknown>)['releasedCredits'], 1);
  await assert.rejects(wallet.settleReservation('owner', reference, 'settle-success', { consumedCredits: 1 }));
});

test('release tombstone closes an ambiguous reserve attempt without moving credits or allowing a late reservation', async () => {
  const state = fakeWalletDatabase(5);
  const wallet = new WalletService(state.db as never);
  const reference = 'invitation-batch/ambiguous';
  const result = await wallet.finalizeReservation('owner', reference, 'release-ambiguous', 'RELEASED', { credits: 3 });
  assert.equal(result.status, 'RELEASED');
  assert.equal(state.wallet.availableCredits, 5);
  assert.equal(state.wallet.reservedCredits, 0);
  const writesBeforeReplay = state.balanceWrites;

  await wallet.finalizeReservation('owner', reference, 'release-ambiguous', 'RELEASED', { credits: 3 });
  await assert.rejects(wallet.reserve('owner', 'late-reserve', { credits: 3, referenceId: reference }));
  assert.equal(state.balanceWrites, writesBeforeReplay);
  assert.equal(state.outbox.length, 1);
});
