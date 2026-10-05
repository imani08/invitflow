import assert from 'node:assert/strict';
import test from 'node:test';
import { DesignsService } from './designs.service.js';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner = 'owner-a';
const photos = [0, 1].map(index => ({ id: `550e8400-e29b-41d4-a716-${String(446655440000 + index).padStart(12, '0')}`, purpose: 'PHOTO', status: 'READY', width: 3600, height: 4800 }));
function fixture() {
  const event = { id: eventId, name: 'Célébration', eventType: 'WEDDING', invitationText: 'Nous serons heureux de célébrer ensemble.', coupleNames: 'Camille et Alex', startAt: '2030-10-12T14:00:00Z', ceremonies: [{ ceremonyType: 'CIVIL', name: 'Mairie', startAt: '2030-10-12T14:00:00Z', location: 'Hôtel de ville', address: '12 rue des Fleurs' }] };
  const created: Record<string, unknown>[] = [];
  const tx = {
    design: { create: async ({ data }: { data: Record<string, unknown> }) => { const value = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ...data, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date() }; created.push(value); return value; } },
    designVersion: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; } },
    outboxMessage: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; } },
  };
  const prisma = { design: { findMany: async () => [] }, $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) };
  const events = { assertOwnerEvent: async (id: string) => { assert.equal(id, eventId); return event; } };
  const service = new DesignsService(prisma as never, events as never);
  return { service, created };
}

test('backend derives proposals from the authorized event and private media, then persists only an unchanged reproducible choice', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.ok(String(url).startsWith('http://media:3014/v1/assets?'));
    return Response.json({ items: photos, nextCursor: null });
  };
  try {
    const { service, created } = fixture();
    const input = { seed: 'server-checkable-seed', preferences: { style: 'minimal', colors: ['gold'], count: 4 }, previouslyShown: [] };
    const response = await service.composerProposals(eventId, owner, 'Bearer event-owner', input);
    assert.equal(response.items.length, 4);
    assert.ok(response.items.some(item => item.document['metadata']['mediaStrategy'] === 'NO_PHOTO'));
    assert.ok(response.items.some(item => item.document['metadata']['mediaStrategy'] !== 'NO_PHOTO'));
    assert.equal(created.length, 0, 'viewing proposals does not persist a Design');
    const proposal = response.items[0]!;
    const selected = await service.selectComposed(eventId, owner, 'Bearer event-owner', { document: proposal.document, name: 'Composer · Célébration' });
    assert.equal(selected.version, 1);
    assert.equal(selected.templateId, null);
    assert.equal(selected.templateSlug, proposal.recipeId);
    assert.equal((selected.document as unknown as { metadata: { composer: { seed: string } } })['metadata']['composer']['seed'], input.seed);
    assert.equal(created.length, 3, 'selection creates Design, immutable version 1 and outbox record');
  } finally { globalThis.fetch = originalFetch; }
});

test('backend rejects a changed candidate document instead of saving arbitrary composition geometry', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], nextCursor: null });
  try {
    const { service, created } = fixture();
    const response = await service.composerProposals(eventId, owner, 'Bearer event-owner', { seed: 'tamper-check-seed', preferences: { count: 4 } });
    const altered = structuredClone(response.items[0]!.document);
    const couple = altered.elements.find((layer: Record<string, unknown>) => layer['id'] === 'couple');
    assert.ok(couple);
    couple['x'] = Number(couple['x']) + 1;
    await assert.rejects(service.selectComposed(eventId, owner, 'Bearer event-owner', { document: altered, name: 'Composition modifiée' }), /périmée ou a été modifiée/);
    assert.equal(created.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
