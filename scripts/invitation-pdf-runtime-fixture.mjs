// Executed only inside the disposable integration container by the launcher.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import Fastify from 'fastify';
import { PrismaClient } from './dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { InvitationService } from './dist/src/invitation.service.js';
import { InvitationStorage } from './dist/src/invitation-storage.js';
import { InvitationsController } from './dist/src/invitations.controller.js';
import { PrismaClient as WalletClient } from './test-wallet/generated/prisma/client.js';
import { WalletService } from './test-wallet/src/wallet.service.js';

const realFetch = globalThis.fetch;
const resources = [], storage = new InvitationStorage(), storedKeys = new Set();
const batchId = randomUUID(), owner = 'pdf-integration-' + randomUUID();
let server, db, walletDb;
async function isolated(Client, connectionString, tables, enums) {
  const admin = new Client({ adapter: new PrismaPg({ connectionString }) });
  const schema = 'pdfcheck_' + randomUUID().replaceAll('-', '');
  await admin.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
  resources.push({ admin, schema });
  for (const table of tables) await admin.$executeRawUnsafe('CREATE TABLE "' + schema + '"."' + table + '" (LIKE public."' + table + '" INCLUDING ALL)');
  for (const [table, column, type, fallback] of enums) {
    const labels = await admin.$queryRawUnsafe('SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 AND t.typname=$2 ORDER BY e.enumsortorder', 'public', type);
    const literal = v => "'" + v.replaceAll("'", "''") + "'";
    await admin.$executeRawUnsafe('CREATE TYPE "' + schema + '"."' + type + '" AS ENUM (' + labels.map(row => literal(row.enumlabel)).join(',') + ')');
    const target = '"' + schema + '"."' + table + '"';
    await admin.$executeRawUnsafe('ALTER TABLE ' + target + ' ALTER COLUMN "' + column + '" DROP DEFAULT');
    await admin.$executeRawUnsafe('ALTER TABLE ' + target + ' ALTER COLUMN "' + column + '" TYPE "' + schema + '"."' + type + '" USING "' + column + '"::text::"' + schema + '"."' + type + '"');
    if (fallback) await admin.$executeRawUnsafe('ALTER TABLE ' + target + ' ALTER COLUMN "' + column + '" SET DEFAULT ' + literal(fallback));
  }
  const url = new URL(connectionString); url.searchParams.set('options', '-c search_path=' + schema + ',public');
  return new Client({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
}
try {
  db = await isolated(PrismaClient, process.env.DATABASE_URL,
    ['invitations', 'invitation_versions', 'invitation_batches', 'invitation_batch_items', 'outbox_messages'],
    [['invitations', 'status', 'InvitationStatus', 'DRAFT'], ['invitation_batches', 'status', 'BatchStatus', 'RESERVING'], ['invitation_batch_items', 'status', 'BatchItemStatus', 'QUEUED']]);
  walletDb = await isolated(WalletClient, process.env.TEST_WALLET_DATABASE_URL,
    ['wallets', 'wallet_entries', 'wallet_reservations', 'outbox_messages'],
    [['wallet_entries', 'type', 'WalletEntryType', null], ['wallet_reservations', 'status', 'ReservationStatus', 'RESERVED']]);
  const wallet = new WalletService(walletDb);
  await walletDb.wallet.create({ data: { ownerSubject: owner, availableCredits: 1 } });
  // Only transport is adapted: real Wallet methods, transactions and tables.
  process.env.WALLET_SERVICE_URL = 'http://isolated-wallet.test';
  process.env.RABBITMQ_MANAGEMENT_URL = '';
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('http://isolated-wallet.test/')) return realFetch(url, options);
    const path = new URL(url).pathname.split('/').map(decodeURIComponent), body = JSON.parse(options.body);
    const key = options.headers['idempotency-key'];
    if (path.at(-1) === 'settle') await wallet.settleReservation(owner, path.at(-2), key, body);
    else await wallet.reserve(owner, key, body);
    return Response.json({ confirmed: true }, { status: 201 });
  };
  const eventId = randomUUID(), guestId = randomUUID(), designId = randomUUID();
  const invitation = await db.invitation.create({ data: { ownerSubject: owner, eventId, guestId } });
  const snapshot = { invitationId: invitation.id, jobId: batchId,
    eventSnapshot: { name: 'Validation InvitaFlow', startAt: '2026-10-12T10:00:00+01:00', location: 'Lieu de test' },
    guestSnapshot: { id: guestId, fullName: 'Invité de test isolé' },
    designSnapshot: { document: { canvas: { width: 1080, height: 1530 }, elements: [], theme: {} } }, renderAssets: {} };
  const version = await db.invitationVersion.create({ data: { invitationId: invitation.id, version: 1, designId, designVersion: 1, snapshot } });
  await db.invitationBatch.create({ data: { id: batchId, ownerSubject: owner, eventId, designId, designVersion: 1, idempotencyKey: randomUUID(), reservationReference: 'invitation-batch/' + batchId, walletReservedCredits: 1, totalItems: 1 } });
  const item = await db.batchItem.create({ data: { batchId, invitationId: invitation.id, invitationVersionId: version.id, guestId, snapshot } });
  const service = new InvitationService(db, storage);
  await assert.rejects(service.download(owner, batchId, item.id));
  await service.reserveAndQueue(owner, batchId, 'isolated-test');
  assert.equal((await wallet.balance(owner)).availableCredits, 0);
  await service.work();
  const batch = await db.invitationBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: true } });
  for (const row of batch.items) if (row.objectKey) storedKeys.add(row.objectKey);
  storedKeys.add('batches/' + batchId + '.zip');
  assert.equal(batch.status, 'COMPLETED'); assert.equal(batch.settlementCredits, 1); assert.ok(batch.settledAt);
  const balance = await wallet.balance(owner); assert.equal(balance.availableCredits, 0); assert.equal(balance.reservedCredits, 0);
  await assert.rejects(service.download('another-owner', batchId, item.id));
  // Real controller and HTTP stream; identity is a test fixture, OIDC is not tested.
  server = Fastify(); const controller = new InvitationsController(service);
  server.get('/invitation.pdf', (req, reply) => controller.pdfForEvent({ identity: { subject: owner } }, batchId, item.id, reply));
  server.get('/invitations.zip', (req, reply) => controller.zipForEvent({ identity: { subject: owner } }, batchId, reply));
  const address = await server.listen({ host: '127.0.0.1', port: 0 });
  const response = await realFetch(address + '/invitation.pdf');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition'), /attachment/); assert.match(response.headers.get('cache-control'), /no-store/);
  const pdf = Buffer.from(await response.arrayBuffer()); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  await writeFile('/test-output/invitation.pdf', pdf);
  const again = Buffer.from(await (await realFetch(address + '/invitation.pdf')).arrayBuffer()); assert.ok(again.equals(pdf));
  const zip = Buffer.from(await (await realFetch(address + '/invitations.zip')).arrayBuffer()); assert.equal(zip.subarray(0, 2).toString(), 'PK');
  await writeFile('/test-output/invitations.zip', zip);
  assert.equal(await walletDb.walletEntry.count({ where: { type: 'SETTLEMENT' } }), 1);
  assert.equal((await wallet.balance(owner)).reservedCredits, 0);
  console.log(JSON.stringify({ batchStatus: batch.status, reserved: 1, consumed: 1, released: 0, httpDownload: 200, repeatedDownloadIdentical: true, settlements: 1, pdfBytes: pdf.length, pdfSha256: createHash('sha256').update(pdf).digest('hex'), realCustomerBalancesModified: false }));
} catch (error) {
  console.log(JSON.stringify({ integrationFailure: true, name: error.name, code: error.code, assertion: error instanceof assert.AssertionError ? { actual: error.actual, expected: error.expected } : undefined }));
  process.exitCode = 1;
} finally {
  if (server) await server.close();
  if (db) {
    // Recover generated object names even if an assertion failed after rendering.
    const rows = await db.batchItem.findMany({ select: { objectKey: true } }).catch(() => []);
    for (const row of rows) if (row.objectKey) storedKeys.add(row.objectKey);
    storedKeys.add('batches/' + batchId + '.zip');
  }
  for (const key of storedKeys) {
    assert.ok(key.startsWith('pdf/' + batchId + '/') || key === 'batches/' + batchId + '.zip');
    await storage.delete(key);
  }
  globalThis.fetch = realFetch;
  if (db) await db.$disconnect(); if (walletDb) await walletDb.$disconnect();
  for (const { admin, schema } of resources.reverse()) { await admin.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE'); await admin.$disconnect(); }
}
