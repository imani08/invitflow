import assert from 'node:assert/strict';
import test from 'node:test';
import { AiDesignService } from './ai-design.service.js';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const designId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fixture(counts = { activeOwner: 0, activeGlobal: 0, recent: 0 }) {
  const locks: unknown[] = [];
  let created = false;
  let persisted: Record<string, unknown> | null = null;
  let outboxCount = 0;
  const tx = {
    $executeRaw: async (query: unknown) => { locks.push(query); return 1; },
    aiDesignJob: {
      findFirst: async () => persisted,
      count: async ({ where }: { where: Record<string, unknown> }) => {
        if ('createdAt' in where) return counts.recent;
        if ('ownerSubject' in where) return counts.activeOwner;
        return counts.activeGlobal;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = true;
        const now = new Date();
        persisted = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ...data, status: 'QUEUED', attempt: 0, summary: null, proposal: null, provider: null, errorCode: null, createdAt: now, updatedAt: now, startedAt: null, completedAt: null, previewObjectKey: null };
        return persisted;
      },
    },
    outboxMessage: { create: async () => { outboxCount += 1; return {}; } },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) };
  const designs = { get: async () => ({ version: 1, document: { canvas: {}, elements: [], theme: {} } }) };
  const service = new AiDesignService(prisma as never, designs as never, {} as never, {} as never);
  return { service, locks, wasCreated: () => created, outboxWrites: () => outboxCount };
}

test('AI job admission locks quota scopes before counting and atomically writes the job outbox', async () => {
  const prior = process.env['AI_PROVIDER'];
  process.env['AI_PROVIDER'] = 'mock';
  try {
    const value = fixture();
    const job = await value.service.create(eventId, designId, 'owner-a', 'Bearer token', { prompt: 'Warm floral invitation palette' });
    assert.equal(job.status, 'QUEUED');
    assert.equal(value.locks.length, 2);
    assert.equal(value.wasCreated(), true);
    assert.equal(value.outboxWrites(), 2);
  } finally {
    if (prior === undefined) delete process.env['AI_PROVIDER'];
    else process.env['AI_PROVIDER'] = prior;
  }
});

test('AI job admission returns HTTP 429 and writes nothing when an owner quota is full', async () => {
  const prior = process.env['AI_PROVIDER'];
  process.env['AI_PROVIDER'] = 'mock';
  try {
    const value = fixture({ activeOwner: 2, activeGlobal: 4, recent: 3 });
    await assert.rejects(
      value.service.create(eventId, designId, 'owner-a', 'Bearer token', { prompt: 'Warm floral invitation palette' }),
      (error: unknown) => error instanceof Error && 'getStatus' in error && typeof error.getStatus === 'function' && error.getStatus() === 429,
    );
    assert.equal(value.wasCreated(), false);
    assert.equal(value.outboxWrites(), 0);
  } finally {
    if (prior === undefined) delete process.env['AI_PROVIDER'];
    else process.env['AI_PROVIDER'] = prior;
  }
});

 test('identical requests reuse the persisted job without another outbox or provider submission', async () => {
  const prior = process.env['AI_PROVIDER'];
  process.env['AI_PROVIDER'] = 'mock';
  try {
    const value = fixture();
    const input = { prompt: 'Warm floral invitation palette' };
    const first = await value.service.create(eventId, designId, 'owner-a', 'Bearer token', input);
    const second = await value.service.create(eventId, designId, 'owner-a', 'Bearer token', input);
    assert.equal(second.id, first.id);
    assert.equal(value.outboxWrites(), 2);
  } finally {
    if (prior === undefined) delete process.env['AI_PROVIDER']; else process.env['AI_PROVIDER'] = prior;
  }
});
