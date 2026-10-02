import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service.js';
import type { PrismaService } from './prisma.service.js';

const eventId = '11111111-1111-4111-8111-111111111111';
const ceremonyId = '22222222-2222-4222-8222-222222222222';
const firstId = '33333333-3333-4333-8333-333333333333';
const secondId = '44444444-4444-4444-8444-444444444444';

function harness(allowed = true) {
  const items = [
    { id: firstId, ceremonyId, position: 0, title: 'Accueil', description: null, location: null, startsAt: null, durationMinutes: null },
    { id: secondId, ceremonyId, position: 1, title: 'Cérémonie', description: null, location: null, startsAt: null, durationMinutes: null },
  ];
  const outbox: unknown[] = [];
  const tx = {
    $queryRaw: async (_query: TemplateStringsArray, requestedEvent: string, owner: string) => allowed && requestedEvent === eventId && owner === 'owner-a' ? [{ id: eventId, status: 'DRAFT', start_at: null, end_at: null }] : [],
    ceremony: { findFirst: async () => ({ id: ceremonyId }) },
    ceremonyProgramItem: {
      findMany: async ({ orderBy }: { orderBy?: { position: 'asc' } } = {}) => orderBy ? [...items].sort((a, b) => a.position - b.position) : [...items],
      create: async ({ data }: { data: Record<string, unknown> }) => { const item = { id: '55555555-5555-4555-8555-555555555555', createdAt: new Date(), updatedAt: new Date(), ...data }; items.push(item as unknown as typeof items[number]); return item; },
      updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const item = items.find((entry) => entry.id === where.id); if (!item) return { count: 0 }; Object.assign(item, data); return { count: 1 }; },
      findFirst: async ({ where }: { where: { id: string } }) => items.find((entry) => entry.id === where.id) ?? null,
      findFirstOrThrow: async ({ where }: { where: { id: string } }) => items.find((entry) => entry.id === where.id)!,
      delete: async ({ where }: { where: { id: string } }) => { const index = items.findIndex((entry) => entry.id === where.id); return items.splice(index, 1)[0]; },
    },
    outboxMessage: { create: async ({ data }: { data: unknown }) => { outbox.push(data); return data; } },
  };
  const prisma = { $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx) } as unknown as PrismaService;
  return { service: new EventsService(prisma), items, outbox };
}

test('ceremony program creates and updates an item including time, duration, description and location', async () => {
  const { service, items, outbox } = harness();
  const created = await service.addProgramItem('owner-a', eventId, ceremonyId, { title: 'Accueil', startsAt: new Date('2026-12-01T12:00:00Z'), durationMinutes: 15, description: 'Bienvenue', location: 'Jardin' });
  assert.equal(created.position, 2);
  assert.equal(created.location, 'Jardin');
  const updated = await service.updateProgramItem('owner-a', eventId, ceremonyId, firstId, { title: 'Accueil des invités', durationMinutes: 20, location: 'Entrée' });
  assert.equal(updated.title, 'Accueil des invités');
  assert.equal(items[0]?.location, 'Entrée');
  assert.equal(outbox.length, 2);
});

test('ceremony program persists the requested order and rejects partial/stale reorder requests', async () => {
  const { service, items } = harness();
  await service.reorderProgramItems('owner-a', eventId, ceremonyId, [secondId, firstId]);
  assert.deepEqual(items.sort((a, b) => a.position - b.position).map((item) => item.id), [secondId, firstId]);
  await assert.rejects(service.reorderProgramItems('owner-a', eventId, ceremonyId, [firstId]), /Reload the ceremony program/);
});

test('ceremony program deletes an item and denies direct-ID access from another owner', async () => {
  const { service, items } = harness();
  assert.deepEqual(await service.removeProgramItem('owner-a', eventId, ceremonyId, firstId), { deleted: true });
  assert.equal(items.some((item) => item.id === firstId), false);
  const otherTenant = harness(false);
  await assert.rejects(otherTenant.service.removeProgramItem('owner-b', eventId, ceremonyId, firstId), NotFoundException);
});
