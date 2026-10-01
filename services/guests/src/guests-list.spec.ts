import assert from 'node:assert/strict';
import test from 'node:test';
import { GuestsService } from './guests.service.js';
import { previewGuestRows } from './guests.service.js';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ceremonyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerSubject = 'owner-1';

function setup() {
  let guestQuery: Record<string, unknown> | undefined;
  let ceremonyScope: string[] | undefined;
  const prisma = {
    guest: {
      findMany: async (query: Record<string, unknown>) => {
        guestQuery = query;
        return [];
      },
      count: async () => 0,
    },
  };
  const events = {
    assertCeremonies: async (_event: string, ceremonyIds: string[]) => {
      ceremonyScope = ceremonyIds;
      return { id: eventId, status: 'PUBLISHED', ceremonies: [] };
    },
  };
  const service = new GuestsService(prisma as never, events as never);
  return { service, query: () => guestQuery, scope: () => ceremonyScope };
}

test('guest list restricts a ceremony filter to invited guests and validates ownership scope', async () => {
  const fixture = setup();
  await fixture.service.list(
    ownerSubject,
    eventId,
    'Bearer token',
    50,
    undefined,
    undefined,
    undefined,
    ceremonyId,
  );
  assert.deepEqual(fixture.scope(), [ceremonyId]);
  assert.deepEqual(fixture.query()?.['where'], {
    ownerSubject,
    eventId,
    deletedAt: null,
    access: { some: { ceremonyId, isInvited: true } },
  });
});

test('guest list rejects a malformed ceremony filter before querying guest rows', async () => {
  const fixture = setup();
  await assert.rejects(
    fixture.service.list(
      ownerSubject,
      eventId,
      'Bearer token',
      50,
      undefined,
      undefined,
      undefined,
      'bad-id',
    ),
  );
  assert.equal(fixture.query(), undefined);
});

test('import preview rejects case-insensitive duplicate emails in the file and existing event', () => {
  const preview = previewGuestRows(
    {
      sheetName: 'CSV',
      headers: ['Nom', 'E-mail'],
      rows: [
        ['Invité 1', 'new@example.test'],
        ['Invité 2', 'NEW@example.test'],
        ['Invité 3', 'already@example.test'],
      ],
    },
    { fullName: 0, email: 1 },
    new Set(['already@example.test']),
  );

  assert.equal(preview[0]?.errors.length, 0);
  assert.equal(
    preview[1]?.errors.some((error) => error.includes('existe déjà')),
    true,
  );
  assert.equal(
    preview[2]?.errors.some((error) => error.includes('existe déjà')),
    true,
  );
});
