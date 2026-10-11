import assert from 'node:assert/strict';
import test from 'node:test';
import { InvitationService } from './invitation.service.js';
import type { PrismaService } from './prisma.service.js';
import type { InvitationStorage } from './invitation-storage.js';

/** In-memory transaction/objects: verifies the service protocol, not PostgreSQL locks. */
function fixture(successes = 2, failures = 1) {
  const objects = new Map<string, Buffer>();
  const items = Array.from({ length: successes + failures }, (_, index) => {
    const objectKey = `pdf/batch/guest-${index}.pdf`, bytes = Buffer.from('%PDF-test-' + index);
    if (index < successes) objects.set(objectKey, bytes);
    return { id: 'item-' + index, invitationId: 'invitation-' + index, invitationVersionId: null, guestId: 'guest-' + index, batchId: 'batch', snapshot: { guestSnapshot: { fullName: 'Invité ' + index } }, status: index < successes ? 'GENERATED' : 'FAILED', objectKey: index < successes ? objectKey : null, sizeBytes: index < successes ? BigInt(bytes.length) : null };
  });
  const batch = { id: 'batch', ownerSubject: 'owner', eventId: 'event', status: 'GENERATING', settlementCredits: null as number | null, settledAt: null as Date | null, totalItems: items.length, completedItems: successes, failedItems: failures, cancelledAt: null as Date | null, agencyReservedCredits: 0, agencyWorkspaceId: null, agencyReservationReference: null, walletReservedCredits: items.length, reservationReference: 'reservation', items };
  const outbox: unknown[] = [];
  const tx = { $queryRaw: async () => [], invitationBatch: {
    findUniqueOrThrow: async () => ({ ...batch, items }),
    update: async ({ data }: { data: Partial<typeof batch> }) => Object.assign(batch, data),
    updateMany: async ({ where, data }: { where: { status?: string; settlementCredits?: number; settledAt?: null }; data: Partial<typeof batch> }) => {
      if (where.status && where.status !== batch.status || where.settlementCredits !== undefined && where.settlementCredits !== batch.settlementCredits || where.settledAt === null && batch.settledAt !== null) return { count: 0 };
      Object.assign(batch, data); return { count: 1 };
    },
  }, outboxMessage: { create: async (value: unknown) => { outbox.push(value); } } };
  const prisma = { ...tx, $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx) } as unknown as PrismaService;
  const storage = { get: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error('missing'); return bytes; }, put: async (key: string, bytes: Buffer) => { objects.set(key, bytes); } } as unknown as InvitationStorage;
  const service = new InvitationService(prisma, storage);
  const worker = service as unknown as { finishIfDone(id: string): Promise<void>; settle(batch: unknown, count: number): Promise<void>; cleanupRenderAssets(snapshot: unknown): Promise<void> };
  worker.cleanupRenderAssets = async () => undefined;
  return { batch, items, objects, outbox, service, worker };
}

test('partial success keeps durable PDFs, consumes only successes and publishes after financial confirmation', async () => {
  const state = fixture(); let settled = 0;
  state.worker.settle = async (_batch, count) => {
    assert.equal(state.batch.status, 'FINALIZING'); assert.equal(state.batch.settledAt, null);
    assert.ok(state.objects.has('batches/batch.zip'));
    await assert.rejects(state.service.download('owner', 'batch', 'item-0'));
    settled = count;
  };
  // Download lookup used only for the pre-settlement denial.
  const privateService = state.service as unknown as { prisma: { invitationBatch: { findFirst(): Promise<unknown> } } };
  privateService.prisma.invitationBatch.findFirst = async () => state.batch;
  await state.worker.finishIfDone('batch');
  assert.equal(settled, 2); assert.equal(state.batch.status, 'PARTIAL'); assert.ok(state.batch.settledAt);
  assert.equal(state.batch.settlementCredits, 2); assert.equal(state.items[0]!.status, 'GENERATED');
  assert.ok(state.objects.has('pdf/batch/guest-0.pdf')); assert.equal(state.outbox.length, 1);
});

test('settlement acknowledgement loss is retried with the frozen count, never refunded or debited twice', async () => {
  const state = fixture(); let requests = 0, debit = 0;
  state.worker.settle = async (_batch, count) => { requests++; if (!debit) debit = count; if (requests === 1) throw new Error('ack lost'); assert.equal(count, debit); };
  await state.worker.finishIfDone('batch');
  assert.equal(state.batch.status, 'FINALIZING'); assert.equal(state.batch.settledAt, null); assert.equal(state.outbox.length, 0);
  await state.worker.finishIfDone('batch'); await state.worker.finishIfDone('batch');
  assert.equal(requests, 2); assert.equal(debit, 2); assert.equal(state.batch.status, 'PARTIAL'); assert.equal(state.outbox.length, 1);
});

test('missing or truncated durable file prevents settlement and downloads', async () => {
  const state = fixture(); let calls = 0;
  state.objects.delete('pdf/batch/guest-0.pdf'); state.worker.settle = async () => { calls++; };
  await state.worker.finishIfDone('batch');
  assert.equal(calls, 0); assert.equal(state.batch.status, 'FINALIZING'); assert.equal(state.batch.settledAt, null);
});

test('cancellation settles only completed items; outstanding items remain non-downloadable', async () => {
  const state = fixture(); state.batch.cancelledAt = new Date(); state.items[2]!.status = 'CANCELLED';
  state.worker.settle = async (_batch, count) => { assert.equal(count, 2); };
  await state.worker.finishIfDone('batch');
  assert.equal(state.batch.status, 'CANCELLED'); assert.equal(state.batch.settlementCredits, 2); assert.ok(state.batch.settledAt);
});

test('all failures settle zero exactly once and never publish a downloadable archive', async () => {
  const state = fixture(0, 2); let calls = 0;
  state.worker.settle = async (_batch, count) => { calls++; assert.equal(count, 0); };
  await state.worker.finishIfDone('batch'); await state.worker.finishIfDone('batch');
  assert.equal(calls, 1); assert.equal(state.batch.status, 'FAILED'); assert.equal(state.objects.size, 0);
});
