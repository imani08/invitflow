import assert from 'node:assert/strict';
import test from 'node:test';
import { ProfileController } from './profile.controller.js';
import type { PrismaService } from './prisma.service.js';

function fixture() {
  const events: Array<{ eventType: string; payload: unknown }> = [];
  let row: {
    id: string;
    status: string;
    identitySubject: string;
    requestedAt: Date;
    cancelledAt: Date | null;
    completedAt: Date | null;
  } | null = null;
  const requestDelegate = {
    findFirst: async ({ where }: { where?: { status?: string } } = {}) =>
      row && (!where?.status || row.status === where.status) ? row : null,
    create: async () => {
      row = {
        id: 'f79b7f4e-0086-4ba3-bb80-e5e495d83fa8',
        status: 'PENDING',
        identitySubject: 'user-1',
        requestedAt: new Date('2026-09-30T12:00:00Z'),
        cancelledAt: null,
        completedAt: null,
      };
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status: string };
      data: { status: string; cancelledAt: Date };
    }) => {
      if (!row || row.id !== where.id || row.status !== where.status) return { count: 0 };
      row = { ...row, ...data };
      return { count: 1 };
    },
  };
  const outboxDelegate = {
    create: async ({ data }: { data: { eventType: string; payload: unknown } }) => {
      events.push(data);
      return data;
    },
  };
  const tx = { accountDeletionRequest: requestDelegate, outboxMessage: outboxDelegate };
  const prisma = {
    accountDeletionRequest: requestDelegate,
    $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx),
  } as unknown as PrismaService;
  return { controller: new ProfileController(prisma), events, current: () => row };
}

const identityRequest = { identity: { subject: 'user-1' } } as never;

test('creates one pending deletion request and publishes its request event transactionally', async () => {
  const { controller, events } = fixture();
  const first = await controller.requestDeletion(identityRequest);
  const repeated = await controller.requestDeletion(identityRequest);
  assert.equal(first.request.status, 'PENDING');
  assert.deepEqual(repeated, first);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, 'profile.account_deletion.requested.v1');
});

test('cancels the pending request and appends a cancellation event at the persisted time', async () => {
  const { controller, events, current } = fixture();
  await controller.requestDeletion(identityRequest);
  const result = await controller.cancelDeletion(identityRequest);
  assert.deepEqual(result, { cancelled: true });
  assert.equal(current()?.status, 'CANCELLED');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['profile.account_deletion.requested.v1', 'profile.account_deletion.cancelled.v1'],
  );
  const cancellationPayload = events[1]?.payload as { cancelledAt: string };
  assert.equal(cancellationPayload.cancelledAt, current()?.cancelledAt?.toISOString());
});

test('reports no cancellation when there is no pending request', async () => {
  const { controller, events } = fixture();
  assert.deepEqual(await controller.cancelDeletion(identityRequest), { cancelled: false });
  assert.equal(events.length, 0);
});
