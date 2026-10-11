import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfessionalTemplate } from '@invitaflow/design-document';
import { DesignsService } from './designs.service.js';
import { DesignsController } from './designs.controller.js';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const designId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture() {
  let selected: unknown; let locked = false; let changed = false;
  const design = { id: designId, eventId, ownerSubject: 'owner-a', status: 'DRAFT', version: 3, name: 'Invitation', document: createProfessionalTemplate('typographic-luxury') };
  const tx = {
    $queryRaw: async () => { locked = true; return []; },
    design: { findFirst: async ({ where }: { where: Record<string, unknown> }) => where['ownerSubject'] === 'owner-a' && where['eventId'] === eventId && (!('version' in where) || !changed) ? design : null },
    eventDesignSelection: { upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => { assert.equal(locked, true); selected = selected ? { ...create, ...update } : create; return selected; } },
  };
  const prisma = { ...tx, $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) };
  const service = new DesignsService(prisma as never, { assertOwnerEvent: async () => ({ id: eventId, ceremonies: [] }) } as never);
  return { service, selection: () => selected, change: () => { changed = true; } };
}
test('continuation persists owner/event/design/version idempotently and rejects stale/foreign designs', async () => {
  const value = fixture();
  await value.service.continueJourney(eventId, 'owner-a', 'Bearer test', designId, { expectedVersion: 3 });
  assert.deepEqual(value.selection(), { eventId, ownerSubject: 'owner-a', designId, version: 3 });
  await value.service.continueJourney(eventId, 'owner-a', 'Bearer test', designId, { expectedVersion: 3 });
  await assert.rejects(value.service.continueJourney(eventId, 'owner-a', 'Bearer test', designId, { expectedVersion: 2 }));
  await assert.rejects(value.service.continueJourney(eventId, 'owner-b', 'Bearer test', designId, { expectedVersion: 3 }));
  value.change(); await assert.rejects(value.service.continueJourney(eventId, 'owner-a', 'Bearer test', designId, { expectedVersion: 3 }));
});
test('validation route awaits the real inspection and returns arrays used by the client', async () => {
  const controller = new DesignsController({ get: async () => ({ document: {} }), inspectDocument: async () => ({ valid: true, problems: [], variables: [], checked: 1 }), editorialContext: async () => ({ fields: [] }) } as never);
  const response = await controller.validate({ identity: { subject: 'owner-a' }, headers: { authorization: 'Bearer test' } } as never, eventId, designId);
  assert.equal(response.valid, true); assert.deepEqual(response.problems, []); assert.deepEqual(response.variables, []);
});
