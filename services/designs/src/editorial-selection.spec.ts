import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfessionalTemplate } from '@invitaflow/design-document';
import { DesignsService } from './designs.service.js';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const designId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const jobId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sourceText = 'Bienvenue à cette journée de partage et de célébration. '.repeat(30);
function fixture(text = sourceText) {
  let current = { id: designId, eventId, ownerSubject: 'owner-a', name: 'Invitation', version: 1, status: 'DRAFT', document: createProfessionalTemplate('typographic-luxury') };
  const history = [{ designId, version: 1, name: current.name, document: structuredClone(current.document) }];
  const events: unknown[] = [];
  const design = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => where['ownerSubject'] === current.ownerSubject && where['eventId'] === eventId ? structuredClone(current) : null,
    findFirstOrThrow: async () => structuredClone(current),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<typeof current> }) => {
      if (where['version'] !== current.version) return { count: 0 };
      current = { ...current, ...data }; return { count: 1 };
    },
  };
  const tx = { design, designVersion: { create: async ({ data }: { data: typeof history[number] }) => { history.push(structuredClone(data)); return data; }, findFirst: async ({ where }: { where: { version: number } }) => history.find(entry => entry.version === where.version) }, outboxMessage: { create: async (value: unknown) => { events.push(value); return value; } } };
  const prisma = { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
  const event = { assertOwnerEvent: async () => ({ id: eventId, name: 'Célébration', invitationText: text, ceremonies: [{ name: 'Civil' }] }) };
  return { service: new DesignsService(prisma as never, event as never), current: () => current, history, events };
}
test('explicit acceptance creates a new immutable version, keeps original, rejects stale and restores history', async () => {
  const savedFetch = globalThis.fetch;
  const value = fixture();
  globalThis.fetch = async () => Response.json({ id: jobId, status: 'PROPOSED', baseVersion: 1, editorial: { elementId: 'invitation', sourceText, proposedText: 'Bienvenue à notre célébration.', fits: true } });
  try {
    assert.equal(value.current().version, 1);
    const selected = await value.service.update(eventId, 'owner-a', 'Bearer test', designId, { editorialJobId: jobId, expectedVersion: 1 });
    assert.equal(selected.version, 2);
    const override = (selected.document as ReturnType<typeof createProfessionalTemplate>)['metadata'].editorialOverrides.invitation;
    assert.equal(override.sourceText, sourceText);
    assert.equal(override.origin, 'AI_ASSISTED');
    assert.equal(value.history.length, 2);
    assert.ok(!value.history[0]!.document['metadata'].editorialOverrides);
    await assert.rejects(value.service.update(eventId, 'owner-a', 'Bearer test', designId, { editorialJobId: jobId, expectedVersion: 1 }));
    await assert.rejects(value.service.update(eventId, 'owner-b', 'Bearer test', designId, { editorialJobId: jobId, expectedVersion: 2 }));
    const restored = await value.service.restore(eventId, 'owner-a', 'Bearer test', designId, { version: 1 });
    assert.equal(restored.version, 3);
    assert.ok(!(restored.document as ReturnType<typeof createProfessionalTemplate>)['metadata'].editorialOverrides);
    assert.equal(value.history[1]!.document['metadata'].editorialOverrides.invitation.selectedText, 'Bienvenue à notre célébration.');
  } finally { globalThis.fetch = savedFetch; }
});
test('rejected, still overflowing or protected-term-altering proposals never update the design', async () => {
  const savedFetch = globalThis.fetch;
  try {
    for (const status of ['FAILED', 'STALE', 'EXPIRED']) {
      const value = fixture();
      globalThis.fetch = async () => Response.json({ id: jobId, status, baseVersion: 1, editorial: null });
      await assert.rejects(value.service.update(eventId, 'owner-a', 'Bearer test', designId, { editorialJobId: jobId, expectedVersion: 1 }));
      assert.equal(value.current().version, 1);
    }
    const value = fixture();
    globalThis.fetch = async () => Response.json({ id: jobId, status: 'PROPOSED', baseVersion: 1, editorial: { elementId: 'invitation', sourceText, proposedText: sourceText, fits: true } });
    await assert.rejects(value.service.update(eventId, 'owner-a', 'Bearer test', designId, { editorialJobId: jobId, expectedVersion: 1 }));
    assert.equal(value.history.length, 1);
    const protectedSource = 'Rendez-vous à 14:30. ' + sourceText;
    const protectedValue = fixture(protectedSource);
    globalThis.fetch = async () => Response.json({ id: jobId, status: 'PROPOSED', baseVersion: 1, editorial: { elementId: 'invitation', sourceText: protectedSource, proposedText: 'Bienvenue.', fits: true } });
    await assert.rejects(protectedValue.service.update(eventId, 'owner-a', 'Bearer test', designId, { editorialJobId: jobId, expectedVersion: 1 }));
    assert.equal(protectedValue.history.length, 1);
  } finally { globalThis.fetch = savedFetch; }
});
test('manual editorial choice is explicit, validated and versioned without a provider call', async () => {
  const value = fixture();
  const result = await value.service.update(eventId, 'owner-a', 'Bearer test', designId, { editorialText: 'Bienvenue à notre célébration.', elementId: 'invitation', sourceText, expectedVersion: 1 });
  assert.equal(result.version, 2);
  assert.equal((result.document as ReturnType<typeof createProfessionalTemplate>)['metadata'].editorialOverrides.invitation.origin, 'MANUAL');
});
