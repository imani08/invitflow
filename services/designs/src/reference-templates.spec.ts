import assert from 'node:assert/strict';
import test from 'node:test';
import { DesignsService } from './designs.service.js';

test('reference catalogue and creation preserve ownership, version snapshots and outbox', async () => {
  let ownerChecks = 0;
  const writes: Record<string, unknown>[] = [];
  const tx = {
    design: { create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return { ...data, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }; } },
    designVersion: { create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); } },
    outboxMessage: { create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); } },
  };
  const prisma = { designTemplate: { findMany: async () => [] }, $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) };
  const events = { assertOwnerEvent: async () => { ownerChecks++; return { eventType: 'WEDDING', ceremonies: [] }; } };
  const service = new DesignsService(prisma as never, events as never);
  const catalogue = await service.listTemplates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bearer test');
  assert.deepEqual(catalogue.items.map(item => item.id), ['reference-01-ivory', 'reference-02-gold']);
  const first = await service.getTemplate('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bearer test', 'reference-02-gold');
  const second = await service.getTemplate('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bearer test', 'reference-02-gold');
  assert.notEqual(first.document, second.document);
  const created = await service.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'Bearer test', { templateId: 'reference-02-gold', name: 'Mon invitation' });
  assert.equal(created.templateId, null);
  assert.equal(created.templateSlug, 'reference-02-gold');
  assert.equal(created.version, 1);
  assert.equal(writes[0]?.['ownerSubject'], 'owner');
  assert.deepEqual(writes[0]?.['document'], writes[1]?.['document']);
  assert.equal(writes[2]?.['eventType'], 'design.created.v1');
  await assert.rejects(service.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'Bearer test', { templateId: 'reference-unknown', name: 'Test' }));
  assert.equal(ownerChecks, 5);
  const denied = new DesignsService(prisma as never, { assertOwnerEvent: async () => { throw new Error('Access denied'); } } as never);
  await assert.rejects(denied.getTemplate('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bearer test', 'reference-01-ivory'), /Access denied/);
  assert.equal(writes.length, 3);
});
