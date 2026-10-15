import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { CheckInLinkService } from './checkin-link.service.js';
import { CheckInLinkStatus } from '../generated/prisma/client.js';

process.env['INVITATIONS_INTERNAL_TOKEN'] ??= 'test-invitations-internal-token-that-is-long-enough';

function makePrismaMock() {
  const links: any[] = [];
  return {
    links,
    prisma: {
      checkInLink: {
        count: async () => links.length,
        create: async ({ data, include }: any) => {
          const id = randomUUID();
          const link = {
            id,
            status: CheckInLinkStatus.ACTIVE,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
            ceremonies: (data.ceremonies?.create ?? []).map((c: any, index: number) => ({
              id: `grant-${index}`,
              linkId: id,
              ceremonyId: c.ceremonyId,
              ceremonyName: c.ceremonyName,
              startAt: c.startAt,
              expiresAt: c.expiresAt,
            })),
          };
          links.push(link);
          return link;
        },
        findMany: async ({ where }: any) => {
          return links.filter(l => l.eventId === where.eventId);
        },
        findUnique: async ({ where }: any) => {
          return links.find(l => (where.tokenHash && l.tokenHash === where.tokenHash) || (where.id && l.id === where.id)) ?? null;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const l of links) {
            const matchesId = !where.id || l.id === where.id;
            const matchesEventId = !where.eventId || l.eventId === where.eventId;
            const matchesStatus = !where.status || l.status === where.status;
            if (matchesId && matchesEventId && matchesStatus) {
              Object.assign(l, data);
              count++;
            }
          }
          return { count };
        },
      },
      checkInLinkCeremonyGrant: {
        deleteMany: async () => ({ count: 0 }),
      },
      $transaction: async (fn: any) => fn({
        checkInLink: {
          findFirst: async ({ where }: any) => links.find(l => (!where.id || l.id === where.id) && (!where.status || l.status === where.status)) ?? null,
          update: async ({ where, data }: any) => {
            const l = links.find(item => item.id === where.id);
            if (l) Object.assign(l, data);
            return l;
          },
        },
        checkInLinkCeremonyGrant: {
          deleteMany: async () => ({ count: 0 }),
        },
      }),
    },
  };
}

test('CheckInLinkService: creation with ceremony scopes sets sha256 token hash and J+1 expiry', async () => {
  const { prisma } = makePrismaMock();
  const eventId = '22222222-2222-4222-8222-222222222222';
  const ceremonyId = '33333333-3333-4333-8333-333333333333';
  const events = {
    assertManageableCeremonies: async () => ({
      id: eventId,
      name: 'Mariage de Jean et Marie',
      timezone: 'Africa/Kinshasa',
      ownerSubject: 'owner-sub',
      ceremonies: [{ id: ceremonyId, name: 'Cérémonie Religieuse', startAt: '2026-11-20T14:00:00.000Z' }],
    }),
    assertCeremonies: async () => ({}),
  };
  const access = { scanDelegated: async () => ({}) };
  const service = new CheckInLinkService(prisma as any, events as any, access as any);

  const created = await service.create('owner-sub', eventId, { label: 'Accueil Entrée Nord' }, 'Bearer auth');
  assert.equal(typeof created.token, 'string');
  assert.equal(created.token.length, 43); // base64url 32 bytes
  assert.equal(created.reference, 'Accueil Entrée Nord');
  assert.equal(created.ceremonies.length, 1);
  assert.equal(created.ceremonies[0]?.ceremonyId, ceremonyId);

  // Vérification que le token stocké est son sha256
  const expectedHash = createHash('sha256').update(created.token).digest('hex');
  const context = await service.publicContext(created.token);
  assert.equal(context.eventName, 'Mariage de Jean et Marie');
  assert.equal(context.reference, 'Accueil Entrée Nord');
  assert.equal(context.ceremonies.length, 1);
  assert.equal(context.ceremonies[0]?.name, 'Cérémonie Religieuse');
  const listed = await service.list('owner-sub', eventId, 'Bearer auth');
  assert.equal(listed.items[0]?.token, created.token);
});

test('CheckInLinkService: global event scope for event with NO ceremonies', async () => {
  const { prisma } = makePrismaMock();
  const eventId = '44444444-4444-4444-8444-444444444444';
  const events = {
    assertManageableCeremonies: async () => ({
      id: eventId,
      name: 'Conférence Tech 2026',
      timezone: 'Europe/Paris',
      ownerSubject: 'owner-sub',
      startAt: '2026-12-05T09:00:00.000Z',
      ceremonies: [],
    }),
    assertCeremonies: async () => ({}),
  };
  const access = { scanDelegated: async () => ({}) };
  const service = new CheckInLinkService(prisma as any, events as any, access as any);

  const created = await service.create('owner-sub', eventId, {}, 'Bearer auth');
  assert.equal(typeof created.token, 'string');
  assert.equal(created.ceremonies.length, 1);
  assert.equal(created.ceremonies[0]?.ceremonyId, eventId);
  assert.equal(created.ceremonies[0]?.ceremonyName, 'Conférence Tech 2026');

  const context = await service.publicContext(created.token);
  assert.equal(context.eventName, 'Conférence Tech 2026');
  assert.equal(context.ceremonies.length, 1);
  assert.equal(context.ceremonies[0]?.id, eventId);
});

test('CheckInLinkService: a global scope requires the event date', async () => {
  const { prisma } = makePrismaMock();
  const eventId = '45444444-4444-4444-8444-444444444444';
  const events = {
    assertManageableCeremonies: async () => ({ id: eventId, name: 'Conférence sans date', timezone: 'Africa/Kinshasa', ownerSubject: 'owner-sub', ceremonies: [] }),
  };
  const service = new CheckInLinkService(prisma as any, events as any, { scanDelegated: async () => ({}) } as any);
  await assert.rejects(() => service.create('owner-sub', eventId, {}, 'Bearer auth'), /date de début/);
});

test('CheckInLinkService: revocation immediately invalidates public access', async () => {
  const { prisma } = makePrismaMock();
  const eventId = '55555555-5555-4555-8555-555555555555';
  const events = {
    assertManageableCeremonies: async () => ({
      id: eventId,
      name: 'Gala Annuel',
      timezone: 'UTC',
      ownerSubject: 'owner-sub',
      startAt: '2026-10-25T18:00:00.000Z',
      ceremonies: [],
    }),
    assertCeremonies: async () => ({}),
  };
  const access = { scanDelegated: async () => ({}) };
  const service = new CheckInLinkService(prisma as any, events as any, access as any);

  const created = await service.create('owner-sub', eventId, {}, 'Bearer auth');
  await service.revoke('owner-sub', eventId, created.id, 'Bearer auth');

  await assert.rejects(
    () => service.publicContext(created.token),
    GoneException,
  );
});

test('CheckInLinkService: delegated scan verifies ceremony grant and rejects out-of-scope ceremony', async () => {
  const { prisma } = makePrismaMock();
  const eventId = '66666666-6666-4666-8666-666666666666';
  const allowedCeremonyId = '77777777-7777-4777-8777-777777777777';
  const forbiddenCeremonyId = '88888888-8888-4888-8888-888888888888';
  const events = {
    assertManageableCeremonies: async () => ({
      id: eventId,
      name: 'Mariage Royal',
      timezone: 'UTC',
      ownerSubject: 'owner-sub',
      ceremonies: [{ id: allowedCeremonyId, name: 'Civil', startAt: '2026-11-15T10:00:00.000Z' }],
    }),
    assertCeremonies: async () => ({}),
  };
  let forwarded = false;
  const access = {
    scanDelegated: async () => {
      forwarded = true;
      return { alreadyCheckedIn: false, guestName: 'Alice', checkedAt: new Date(), companionCount: 0, allowedCompanions: 1 };
    },
  };
  const service = new CheckInLinkService(prisma as any, events as any, access as any);
  const created = await service.create('owner-sub', eventId, {}, 'Bearer auth');

  // Rejet hors périmètre
  await assert.rejects(
    () => service.publicScan(created.token, { token: `${'a'.repeat(36)}.${'b'.repeat(43)}`, ceremonyId: forbiddenCeremonyId }),
    ForbiddenException,
  );
  assert.equal(forwarded, false);

  // Scan autorisé
  const result = await service.publicScan(created.token, { token: `${'a'.repeat(36)}.${'b'.repeat(43)}`, ceremonyId: allowedCeremonyId });
  assert.equal(forwarded, true);
  assert.equal((result as any).guestName, 'Alice');
});
