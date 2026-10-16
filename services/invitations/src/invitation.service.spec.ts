import assert from 'node:assert/strict';
import test from 'node:test';
import { emissionRequestHash } from './emission-policy.mjs';
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

test('rendered PDFs cannot be downloaded before financial finalization', async () => {
  for (const status of ['RESERVING', 'QUEUED', 'GENERATING', 'FINALIZING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL']) {
    let storageCalls = 0;
    const prisma = { invitationBatch: { findFirst: async () => ({ status, items: [{ id: 'item', guestId: guestA, status: 'GENERATED', objectKey: 'private.pdf' }] }) } } as unknown as PrismaService;
    const storage = { stream: async () => { storageCalls++; return new Response('pdf'); } } as unknown as InvitationStorage;
    const service = new InvitationService(prisma, storage);
    await assert.rejects(service.download('owner', 'batch', 'item'), /finalisation financière/);
    assert.equal(storageCalls, 0);
  }
});

test('a completed invitation can be downloaded repeatedly without contacting Wallet', async () => {
  let reads = 0;
  const prisma = { invitationBatch: { findFirst: async (args: unknown) => {
    assert.deepEqual(args, { where: { id: 'batch', ownerSubject: 'owner' }, include: { items: true } });
    return { status: 'COMPLETED', settledAt: new Date(), settlementCredits: 1, items: [{ id: 'item', guestId: guestA, status: 'GENERATED', objectKey: 'private.pdf' }] };
  } } } as unknown as PrismaService;
  const storage = { stream: async () => { reads++; return new Response('pdf'); } } as unknown as InvitationStorage;
  const service = new InvitationService(prisma, storage);
  assert.equal((await service.download('owner', 'batch', 'item')).type, 'application/pdf');
  assert.equal((await service.download('owner', 'batch', 'item')).type, 'application/pdf');
  assert.equal(reads, 2);
});

async function withStorageCapacity<T>(work: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env['STORAGE_MONITOR_TOKEN'];
  process.env['STORAGE_MONITOR_TOKEN'] = 'unit-test-storage-token';
  globalThis.fetch = async (input, init) => String(input).includes('/v1/internal/storage/capacity')
    ? new Response(JSON.stringify({ diskStatsAvailable: false, blocked: false }), { status: 200, headers: { 'content-type': 'application/json' } })
    : originalFetch(input, init);
  try { return await work(); } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env['STORAGE_MONITOR_TOKEN']; else process.env['STORAGE_MONITOR_TOKEN'] = originalToken;
  }
}

function serviceWithPrior() {
  const prior = { requestHash: null as string | null, id: 'batch-1', eventId, designId, designVersion: 3, zipSizeBytes: 9007199254740993n, items: [{ guestId: guestA, sizeBytes: 9007199254740993n }, { guestId: guestB, sizeBytes: null }] };
  const publicBatch = { id: prior.id, ownerSubject: 'owner', zipSizeBytes: 9007199254740993n, items: [{ id: 'item-1', guestId: guestA, status: 'QUEUED', objectKey: null, errorCode: null, updatedAt: new Date() }] };
  const prisma = { invitationBatch: { findUnique: async () => prior, findFirst: async () => publicBatch } } as unknown as PrismaService;
  return { service: new InvitationService(prisma, {} as InvitationStorage), prior, publicBatch };
}

test('generation idempotency returns a prior batch only for the same event, design and selected guests', async () => {
  await withStorageCapacity(async () => {
    const { service, prior, publicBatch } = serviceWithPrior();
    const replay = (requestedEvent: string, requestedDesign: string, guestIds: string[]) =>
      service.createBatch('owner', requestedEvent, 'Bearer token', 'same-key', { designId: requestedDesign, guestIds });

    const replayed = await replay(eventId, designId, [guestB, guestA]);
    assert.doesNotThrow(() => JSON.stringify(replayed));
    assert.deepEqual(replayed, { ...publicBatch, zipSizeBytes: '9007199254740993' });
    await assert.rejects(replay(otherEventId, designId, [guestA, guestB]), /autre demande de génération/);
    await assert.rejects(replay(eventId, otherDesignId, [guestA, guestB]), /autre demande de génération/);
    await assert.rejects(replay(eventId, designId, [guestA, guestC]), /autre demande de génération/);
  });
});

test('all-guests replay is bound to its original intent; explicit empty selection is rejected', async () => {
  await withStorageCapacity(async () => {
    const { service, prior, publicBatch } = serviceWithPrior();
    prior.requestHash = emissionRequestHash(eventId, designId, undefined, []);
    const omitted = await service.createBatch('owner', eventId, 'Bearer token', 'same-key', { designId });
    await assert.rejects(service.createBatch('owner', eventId, 'Bearer token', 'same-key', { designId, guestIds: [] }), /au moins un invité/);
    assert.deepEqual(omitted, { ...publicBatch, zipSizeBytes: '9007199254740993' });

  });
});

test('a replay cannot reuse a reservation for a different reviewed design version', async () => {
  await withStorageCapacity(async () => {
    const { service, prior, publicBatch } = serviceWithPrior();
    prior.requestHash = emissionRequestHash(eventId, designId, 3, []);
    assert.deepEqual(await service.createBatch('owner', eventId, 'Bearer token', 'same-key', { designId, expectedDesignVersion: 3 }), { ...publicBatch, zipSizeBytes: '9007199254740993' });
    await assert.rejects(service.createBatch('owner', eventId, 'Bearer token', 'same-key', { designId, expectedDesignVersion: 4 }), /autre demande/);
    await assert.rejects(service.createBatch('owner', eventId, 'Bearer token', 'same-key', { designId, expectedDesignVersion: 0 }), /Version/);
  });
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
    batchItem: { updateMany: async () => ({ count: 4 }) },
    invitationBatch: {
      findMany: async () => [{ id: 'batch-1', ownerSubject: 'owner', reservationReference: 'reservation-1', totalItems: 4 }],
      updateMany: async (args: unknown) => { assert.deepEqual(args, { where: { id: 'batch-1', status: 'FAILED', reservationReleasePending: true }, data: { reservationReleasePending: false, failedItems: 4 } }); cleared += 1; return { count: 1 }; },
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

test('an agency settlement never falls back to the personal Wallet', async () => {
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
    return new Response(null, { status: 200 });
  };
  try {
    const service = new InvitationService({} as PrismaService, {} as InvitationStorage);
    const settle = service as unknown as { settle(batch: { ownerSubject: string; reservationReference: string; agencyWorkspaceId: string | null; agencyReservationReference: string | null; agencyReservedCredits: number; walletReservedCredits: number }, consumed: number): Promise<void> };
    await assert.rejects(() => settle.settle({ ownerSubject: 'owner', reservationReference: 'wallet-ref', agencyWorkspaceId: 'agency-id', agencyReservationReference: 'agency-ref', agencyReservedCredits: 2, walletReservedCredits: 3 }, 3), /cannot settle against a personal Wallet/);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEventsUrl === undefined) delete process.env['EVENTS_SERVICE_URL']; else process.env['EVENTS_SERVICE_URL'] = originalEventsUrl;
    if (originalWalletUrl === undefined) delete process.env['WALLET_SERVICE_URL']; else process.env['WALLET_SERVICE_URL'] = originalWalletUrl;
    if (originalToken === undefined) delete process.env['WALLET_INTERNAL_TOKEN']; else process.env['WALLET_INTERNAL_TOKEN'] = originalToken;
  }
});

test('an agency quote reads only the agency quota and never the personal Wallet', async () => {
  const originalEventsUrl = process.env['EVENTS_SERVICE_URL'];
  process.env['EVENTS_SERVICE_URL'] = 'http://events.test';
  const service = new InvitationService({} as PrismaService, {} as InvitationStorage);
  const internal = service as unknown as {
    snapshots(...args: unknown[]): Promise<unknown>;
    upstream(url: string): Promise<unknown>;
  };
  internal.snapshots = async () => ({ event: { agencyWorkspaceId: 'agency-id' }, guests: [{ id: guestA }, { id: guestB }], design: { version: 4 } });
  internal.upstream = async (url) => {
    assert.equal(url, 'http://events.test/v1/agencies/agency-id/quota');
    return { remaining: 1 };
  };
  try {
    const quote = await service.quote('owner', eventId, 'Bearer token', { designId, guestIds: [guestA, guestB], expectedDesignVersion: 4 });
    assert.deepEqual(quote, { invitationCount: 2, creditsRequired: 2, availableCredits: 1, walletAvailableCredits: 0, agencyAvailableCredits: 1, missingCredits: 1, guestIds: [guestA, guestB], designVersion: 4, ownerSubject: 'owner' });
  } finally {
    if (originalEventsUrl === undefined) delete process.env['EVENTS_SERVICE_URL']; else process.env['EVENTS_SERVICE_URL'] = originalEventsUrl;
  }
});

test('legacy failed retry cannot reserve again before original zero settlement is confirmed', async () => {
  let created = false, settled = false;
  const source = { id: 'failed-batch', ownerSubject: 'owner', eventId, status: 'FAILED', settledAt: null, completedItems: 0, reservationReleasePending: false, items: [{ status: 'FAILED', errorCode: 'RENDER_FAILED' }] };
  const prisma = { invitationBatch: { findFirst: async () => source, findUnique: async () => null }, $transaction: async () => { created = true; } };
  const service = new InvitationService(prisma as unknown as PrismaService, {} as InvitationStorage);
  const internal = service as unknown as { upstream(): Promise<unknown>; settle(batch: unknown, count: number): Promise<void> };
  internal.upstream = async () => ({});
  internal.settle = async (batch, count) => { assert.equal(batch, source); assert.equal(count, 0); settled = true; throw new Error('Settlement outcome not confirmed'); };
  const previous = process.env['EVENTS_SERVICE_URL']; process.env['EVENTS_SERVICE_URL'] = 'http://events.invalid';
  try { await assert.rejects(service.retryFailed('owner', 'failed-batch', 'Bearer test'), /not confirmed/); assert.equal(settled, true); assert.equal(created, false); }
  finally { if (previous === undefined) delete process.env['EVENTS_SERVICE_URL']; else process.env['EVENTS_SERVICE_URL'] = previous; }
});

test('technical retry replay returns its existing child without another reservation or emission', async () => {
  const source = { id: 'failed-batch', ownerSubject: 'owner' }, child = { id: 'retry-batch' };
  const prisma = { invitationBatch: { findFirst: async () => source, findUnique: async () => child }, $transaction: async () => { throw new Error('Unexpected new emission'); } };
  const service = new InvitationService(prisma as unknown as PrismaService, {} as InvitationStorage);
  service.getBatch = async (_owner, id) => { assert.equal(id, child.id); return child as never; };
  assert.deepEqual(await service.retryFailed('owner', source.id, 'Bearer test'), child);
});

test('production runtime keeps the external QR and PDF rendering tools', async () => {
  const { readFile } = await import('node:fs/promises');
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const runtime = dockerfile.slice(dockerfile.lastIndexOf('FROM '));
  assert.match(runtime, /apt-get install[^\n]*qrencode[^\n]*chromium/);
  assert.match(runtime, /CHROMIUM_PATH=\/usr\/bin\/chromium/);
  assert.match(runtime, /QR_ENCODE_PATH=\/usr\/bin\/qrencode/);
  assert.match(runtime, /USER node/);
});

test('fallback QR image uses the same bounded size as an inline SVG', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./invitation.service.ts', import.meta.url), 'utf8');
  assert.match(source, /\.qr svg,\.qr img\{display:block;width:100%;height:100%\}/);
});

test('batch list, pagination and detail serialize PostgreSQL bigint sizes losslessly', async () => {
  const row = { id: eventId, ownerSubject: 'owner', zipSizeBytes: 9007199254740993n, settledAt: new Date(), status: 'COMPLETED' };
  const prisma = { invitationBatch: { findMany: async () => [row], findFirst: async () => row } };
  const service = new InvitationService(prisma as unknown as PrismaService, {} as InvitationStorage);
  for (const result of [await service.list('owner', eventId), await service.list('owner', eventId, '10'), await service.getBatch('owner', row.id)]) {
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.match(JSON.stringify(result), /"zipSizeBytes":"9007199254740993"/);
  }
  row.zipSizeBytes = null as never;
  assert.equal((await service.getBatch('owner', row.id)).zipSizeBytes, null);
});
