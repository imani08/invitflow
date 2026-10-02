import assert from 'node:assert/strict';
import test from 'node:test';
import { InvitationService } from './invitation.service.js';
import type { PrismaService } from './prisma.service.js';
import type { InvitationStorage } from './invitation-storage.js';

const eventId = '11111111-1111-4111-8111-111111111111';
const otherEventId = '44444444-4444-4444-8444-444444444444';
const designId = '22222222-2222-4222-8222-222222222222';
const otherDesignId = '55555555-5555-4555-8555-555555555555';
const guestA = '33333333-3333-4333-8333-333333333333';
const guestB = '66666666-6666-4666-8666-666666666666';
const guestC = '77777777-7777-4777-8777-777777777777';

function serviceWithPrior() {
  const prior = { id: 'batch-1', eventId, designId, items: [{ guestId: guestA }, { guestId: guestB }] };
  const prisma = { invitationBatch: { findUnique: async () => prior } } as unknown as PrismaService;
  return { service: new InvitationService(prisma, {} as InvitationStorage), prior };
}

test('generation idempotency returns a prior batch only for the same event, design and selected guests', async () => {
  const { service, prior } = serviceWithPrior();
  const replay = (requestedEvent: string, requestedDesign: string, guestIds: string[]) =>
    service.createBatch('owner', requestedEvent, 'Bearer token', 'same-key', { designId: requestedDesign, guestIds });

  assert.equal(await replay(eventId, designId, [guestB, guestA]), prior);
  await assert.rejects(replay(otherEventId, designId, [guestA, guestB]), /autre demande de génération/);
  await assert.rejects(replay(eventId, otherDesignId, [guestA, guestB]), /autre demande de génération/);
  await assert.rejects(replay(eventId, designId, [guestA, guestC]), /autre demande de génération/);
});

test('generation idempotency treats an omitted guest list and an empty list as the same all-guests request', async () => {
  const { service, prior } = serviceWithPrior();
  const omitted = await service.createBatch('owner', eventId, 'Bearer token', 'same-key', { designId });
  const empty = await service.createBatch('owner', eventId, 'Bearer token', 'same-key', { designId, guestIds: [] });
  assert.equal(omitted, prior);
  assert.equal(empty, prior);
});

test('pending reservation release is retried idempotently and only cleared after Wallet confirms it', async () => {
  const originalFetch = globalThis.fetch;
  const originalWalletUrl = process.env['WALLET_SERVICE_URL'];
  const originalToken = process.env['WALLET_INTERNAL_TOKEN'];
  process.env['WALLET_SERVICE_URL'] = 'http://wallet.test';
  process.env['WALLET_INTERNAL_TOKEN'] = 'internal-test-token';
  let calls = 0;
  let cleared = 0;
  const prisma = {
    invitationBatch: {
      findMany: async () => [{ id: 'batch-1', ownerSubject: 'owner', reservationReference: 'reservation-1', totalItems: 4 }],
      updateMany: async (args: unknown) => { assert.deepEqual(args, { where: { id: 'batch-1', status: 'FAILED', reservationReleasePending: true }, data: { reservationReleasePending: false } }); cleared += 1; return { count: 1 }; },
    },
  } as never;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    assert.equal(String(url), 'http://wallet.test/v1/internal/wallets/owner/reservations/reservation-1/release');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.headers && (init.headers as Record<string, string>)['idempotency-key'], 'release-reservation-1');
    assert.deepEqual(JSON.parse(String(init?.body)), { credits: 4 });
    return new Response(null, { status: calls === 1 ? 503 : 200 });
  };
  try {
    const service = new InvitationService(prisma, {} as InvitationStorage);
    const worker = service as unknown as { retryPendingReservationReleases(): Promise<void> };
    await worker.retryPendingReservationReleases();
    assert.equal(cleared, 0);
    await worker.retryPendingReservationReleases();
    assert.equal(calls, 2);
    assert.equal(cleared, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWalletUrl === undefined) delete process.env['WALLET_SERVICE_URL']; else process.env['WALLET_SERVICE_URL'] = originalWalletUrl;
    if (originalToken === undefined) delete process.env['WALLET_INTERNAL_TOKEN']; else process.env['WALLET_INTERNAL_TOKEN'] = originalToken;
  }
});

test('settlement consumes agency quota first and only charges Wallet for the remainder', async () => {
  const originalFetch = globalThis.fetch;
  const originalEventsUrl = process.env['EVENTS_SERVICE_URL'];
  const originalWalletUrl = process.env['WALLET_SERVICE_URL'];
  const originalToken = process.env['WALLET_INTERNAL_TOKEN'];
  process.env['EVENTS_SERVICE_URL'] = 'http://events.test';
  process.env['WALLET_SERVICE_URL'] = 'http://wallet.test';
  process.env['WALLET_INTERNAL_TOKEN'] = 'internal-test-token';
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const body = JSON.parse(String(init?.body));
    if (String(url).startsWith('http://events.test')) assert.deepEqual(body, { consumedCredits: 2 });
    else assert.deepEqual(body, { consumedCredits: 1 });
    return new Response(null, { status: 200 });
  };
  try {
    const service = new InvitationService({} as PrismaService, {} as InvitationStorage);
    const settle = service as unknown as { settle(batch: { ownerSubject: string; reservationReference: string; agencyWorkspaceId: string | null; agencyReservationReference: string | null; agencyReservedCredits: number; walletReservedCredits: number }, consumed: number): Promise<void> };
    await settle.settle({ ownerSubject: 'owner', reservationReference: 'wallet-ref', agencyWorkspaceId: 'agency-id', agencyReservationReference: 'agency-ref', agencyReservedCredits: 2, walletReservedCredits: 3 }, 3);
    assert.equal(calls.length, 2);
    assert.match(calls[0]!, /events\.test/);
    assert.match(calls[1]!, /wallet\.test/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEventsUrl === undefined) delete process.env['EVENTS_SERVICE_URL']; else process.env['EVENTS_SERVICE_URL'] = originalEventsUrl;
    if (originalWalletUrl === undefined) delete process.env['WALLET_SERVICE_URL']; else process.env['WALLET_SERVICE_URL'] = originalWalletUrl;
    if (originalToken === undefined) delete process.env['WALLET_INTERNAL_TOKEN']; else process.env['WALLET_INTERNAL_TOKEN'] = originalToken;
  }
});
