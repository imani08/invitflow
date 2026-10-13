// Executed only inside the disposable integration container by the launcher.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import { PrismaClient } from './dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { InvitationService } from './dist/src/invitation.service.js';
import { InvitationStorage } from './dist/src/invitation-storage.js';
import { InvitationsController } from './dist/src/invitations.controller.js';
import { invitationToken } from './dist/src/invitation-token.mjs';
import { PrismaClient as WalletClient } from './test-wallet/generated/prisma/client.js';
import { WalletService } from './test-wallet/src/wallet.service.js';
import { createReferenceTemplate, editableDocument, moveEditableGroup, resolveDesignLayout } from '@invitaflow/design-document';
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
  let snapshot = { invitationId: invitation.id, jobId: batchId,
    eventSnapshot: { name: 'Validation InvitaFlow', startAt: '2026-10-12T10:00:00+01:00', location: 'Lieu de test' },
    guestSnapshot: { id: guestId, fullName: 'Invité de test isolé' },
    designSnapshot: { document: { canvas: { width: 1080, height: 1530 }, elements: [], theme: {} } }, renderAssets: {} };
  if (process.env.TEST_SOURCE_BATCH) {
    const source = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    try {
      const original = await source.batchItem.findFirstOrThrow({ where: { batchId: process.env.TEST_SOURCE_BATCH } });
      snapshot = structuredClone(original.snapshot);
      snapshot.invitationId = invitation.id; snapshot.jobId = batchId;
      // Copy immutable images into the diagnostic namespace: finalization must
      // never clean up the customer's original snapshots.
      for (const [assetId, entry] of Object.entries(snapshot.renderAssets ?? {})) {
        const oldKey = typeof entry === 'string' ? entry : entry.key;
        const key = 'batches/' + batchId + '/' + randomUUID() + (oldKey.endsWith('.png') ? '.png' : '.webp');
        let bytes; let mimeType = typeof entry === 'string' ? 'image/webp' : entry.mimeType;
        try { bytes = await storage.get(oldKey); } catch (error) { if (!process.env.TEST_DIAGNOSTIC_PHOTO) throw error; const map=JSON.parse(await readFile('/test-pdf-audit/diagnostic-images.json','utf8')); const name=map[assetId]; if(typeof name!=='string'|| !/^[a-zA-Z0-9_-]+\.(?:png|webp)$/.test(name))throw error; bytes=await readFile('/test-pdf-audit/'+name); mimeType=name.endsWith('.webp')?'image/webp':'image/png'; }
        await storage.put(key, bytes, mimeType);
        storedKeys.add(key);
        snapshot.renderAssets[assetId] = { key, mimeType };
      }
    } finally { await source.$disconnect(); }
  }
  if (!process.env.TEST_SOURCE_BATCH) {
    let document = editableDocument(createReferenceTemplate('reference-01-ivory'));
    const photoId = randomUUID(), photoKey = 'batches/' + batchId + '/' + photoId + '.png';
    // Tiny generated test image. No customer photo or source batch is modified.
    const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    await storage.put(photoKey, photo, 'image/png'); storedKeys.add(photoKey);
    document.elements.push({ id: 'test-private-photo', name: 'Photo test isolée', type: 'IMAGE', role: 'PHOTO', assetId: photoId, sourceWidth: 1, sourceHeight: 1, x: 200, y: 400, width: 800, height: 600, rotation: 8, opacity: .7, locked: false, editable: true, zIndex: 30, fit: 'cover', cropX: 50, cropY: 50, cropScale: 1 });
    document.assets.push({ id: photoId, assetId: photoId, width: 1, height: 1, mimeType: 'image/png', role: 'COUPLE_PHOTO' });
    snapshot.renderAssets[photoId] = { key: photoKey, mimeType: 'image/png' };
    document.elements.push({ id:'test-editable-text',name:'Texte ajouté',type:'TEXT',x:340,y:1230,width:800,height:100,rotation:0,locked:false,editable:true,zIndex:80,text:'Texte ajouté et enregistré',fontId:'arial',fontFamily:'Arial',fontSize:34,preferredFontSize:34,minFontSize:20,maxFontSize:34,lineHeight:1.2,overflowPolicy:'SHRINK_WITH_LIMIT',color:'#32163a',opacity:1 });
    document.elements.push({ ...structuredClone(document.elements.at(-1)), id:'test-grouped-text', text:'Deuxième texte du groupe', y:1340 });
    document.metadata.editorGroups=[{id:'test-group',elementIds:['test-editable-text','test-grouped-text']}];
    document=moveEditableGroup(document,'test-editable-text',380,1260);
    const first=document.elements.find(layer=>layer.id==='test-editable-text'),second=document.elements.find(layer=>layer.id==='test-grouped-text');
    assert.equal(second.y-first.y,110);assert.equal(first.x,380);
    snapshot.designSnapshot.document = document;
    snapshot.resolvedLayout = resolveDesignLayout(document, { guest:{name:'Invité de test isolé'},event:{title:'Validation InvitaFlow'},ceremonies:[{name:'Accueil',date:'13/10/2026',time:'10:00',venue:'Lieu de test'}],qr:{available:true} },undefined,{}, {mode:'web'});
  }
  const version = await db.invitationVersion.create({ data: { invitationId: invitation.id, version: 1, designId, designVersion: 1, snapshot } });
  await db.invitationBatch.create({ data: { id: batchId, ownerSubject: owner, eventId, designId, designVersion: 1, idempotencyKey: randomUUID(), reservationReference: 'invitation-batch/' + batchId, walletReservedCredits: 1, totalItems: 1 } });
  const item = await db.batchItem.create({ data: { batchId, invitationId: invitation.id, invitationVersionId: version.id, guestId, snapshot } });
  const service = new InvitationService(db, storage);
  let renderMs = 0; const realRender = service.render.bind(service); service.render = async snapshot => { const started=Date.now(); try { return await realRender(snapshot); } finally { renderMs+=Date.now()-started; } };
  await assert.rejects(service.download(owner, batchId, item.id));
  await service.reserveAndQueue(owner, batchId, 'isolated-test');
  assert.equal((await wallet.balance(owner)).availableCredits, 0);
  const originalWarn = console.warn;
  console.warn = message => {
    try {
      const entry = JSON.parse(message);
      if (entry.event === 'invitation_render_failed') console.log(JSON.stringify({ event: entry.event, stage: entry.stage, attempt: entry.attempt, errorCode: entry.errorCode, reason: entry.reason }));
    } catch { /* Raw errors can include credentials: keep them out of test output. */ }
  };
  let batch;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await service.work();
      batch = await db.invitationBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: true } });
      if (batch.status === 'COMPLETED' || !batch.items.some(row => row.status === 'QUEUED')) break;
    }
  } finally { console.warn = originalWarn; }
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
  const qrTarget = process.env.PUBLIC_WEB_URL.replace(/\/$/, '') + '/invite/' + invitationToken(invitation.id);
  await writeFile('/test-output/qr-expected-sha256.txt', createHash('sha256').update(qrTarget).digest('hex'));
  const again = Buffer.from(await (await realFetch(address + '/invitation.pdf')).arrayBuffer()); assert.ok(again.equals(pdf));
  const zip = Buffer.from(await (await realFetch(address + '/invitations.zip')).arrayBuffer()); assert.equal(zip.subarray(0, 2).toString(), 'PK');
  await writeFile('/test-output/invitations.zip', zip);
  await service.settle(batch, 1); // Lost-ack replay uses the same durable key.
  await service.work();
  assert.equal(await walletDb.walletEntry.count({ where: { type: 'SETTLEMENT' } }), 1);
  assert.equal((await wallet.balance(owner)).reservedCredits, 0);
  console.log(JSON.stringify({ batchStatus: batch.status, reserved: 1, consumed: 1, released: 0, httpDownload: 200, repeatedDownloadIdentical: true, settlements: 1, pdfBytes: pdf.length, zipBytes: zip.length, renderMs, pdfSha256: createHash('sha256').update(pdf).digest('hex'), realCustomerBalancesModified: false }));
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
    assert.ok(key.startsWith('pdf/' + batchId + '/') || key.startsWith('batches/' + batchId + '/') || key === 'batches/' + batchId + '.zip');
    await storage.delete(key);
  }
  globalThis.fetch = realFetch;
  if (db) await db.$disconnect(); if (walletDb) await walletDb.$disconnect();
  for (const { admin, schema } of resources.reverse()) { await admin.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE'); await admin.$disconnect(); }
}
