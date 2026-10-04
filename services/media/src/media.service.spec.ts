import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { MediaAssetCategory, MediaAssetPurpose, MediaAssetStatus } from '../generated/prisma/client.js';
import { MediaService } from './media.service.js';
import type { MediaStorage } from './media-storage.js';
import type { PrismaService } from './prisma.service.js';

const assetId = '550e8400-e29b-41d4-a716-446655440000';

function makeService() {
  process.env['MEDIA_ANTIVIRUS_HOST'] = '127.0.0.1';
  process.env['MEDIA_ANTIVIRUS_PORT'] = '3310';
  const requestedKeys: string[] = [];
  const readKeys: string[] = [];
  const outboxEntries: unknown[] = [];
  const cleanupEntries: unknown[] = [];
  let failObjectDelete = false;
  let deletionCalls = 0;
  const asset = {
    id: assetId,
    ownerSubject: 'owner-1',
    purpose: MediaAssetPurpose.PHOTO,
    category: MediaAssetCategory.ORIGINAL_MEDIA,
    status: MediaAssetStatus.READY,
    originalName: 'photo.webp',
    declaredMimeType: 'image/jpeg',
    detectedMimeType: 'image/webp',
    sizeBytes: 1200,
    width: 400,
    height: 300,
    sha256: 'a'.repeat(64),
    objectKey: `assets/${assetId}`,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    intentExpiresAt: new Date('2026-10-01T00:00:00Z'),
    uploadExpiresAt: new Date('2026-10-01T00:00:00Z'),
    quarantineExpiresAt: null,
  } as { id: string; ownerSubject: string; purpose: MediaAssetPurpose; category: MediaAssetCategory; status: MediaAssetStatus; originalName: string; declaredMimeType: string; detectedMimeType: string; sizeBytes: number; width: number; height: number; sha256: string; objectKey: string | null; createdAt: Date; intentExpiresAt: Date; uploadExpiresAt: Date; quarantineExpiresAt: Date | null; uploadKey?: string | null; quarantineKey?: string; updatedAt?: Date; previewSizeBytes?: number | null; thumbnailSizeBytes?: number | null; deletedAt?: Date | null; derivedJob?: { id: string } | null };
  const prisma = {
    mediaAsset: {
      findFirst: async ({ where }: { where: { ownerSubject: string; id: string } }) => {
        assert.equal(where.ownerSubject, 'owner-1');
        assert.equal(where.id, assetId);
        return asset;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(asset, data); return { count: 1 }; },
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      findMany: async ({ where }: { where?: { status?: MediaAssetStatus; objectKey?: null } }) => where?.status === MediaAssetStatus.DELETING && asset.status === MediaAssetStatus.DELETING && (where.objectKey === undefined || where.objectKey === null && asset.objectKey === null) ? [{ ...asset }] : [],
    },
    mediaTransformationJob: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: '660e8400-e29b-41d4-a716-446655440000', status: 'PENDING', ...data }),
    },
    mediaCleanupEntry: { create: async ({ data }: { data: unknown }) => { cleanupEntries.push(data); return data; }, updateMany: async () => ({ count: 0 }) },
    outboxMessage: { create: async (entry: { data: unknown }) => { outboxEntries.push(entry); return entry.data; } },
    $transaction: async (work: (tx: unknown) => unknown) => typeof work === 'function' ? work(prisma) : Promise.all(work as Promise<unknown>[]),
  } as unknown as PrismaService;
  const storage = {
    createDownloadUrl: async (key: string) => {
      requestedKeys.push(key);
      return { url: 'https://storage.example.test/signed', method: 'GET' };
    },
    readReady: async (key: string) => {
      readKeys.push(key);
      return Buffer.from('sanitized webp');
    },
    deleteQuarantine: async () => { deletionCalls += 1; if (failObjectDelete) throw new Error('MinIO unavailable'); },
    deleteReady: async () => { deletionCalls += 1; if (failObjectDelete) throw new Error('MinIO unavailable'); },
    deleteVariants: async () => { deletionCalls += 1; if (failObjectDelete) throw new Error('MinIO unavailable'); },
  } as unknown as MediaStorage;
  return { service: new MediaService(prisma, storage), requestedKeys, readKeys, outboxEntries, cleanupEntries, setObjectDeleteFailure: (value: boolean) => { failObjectDelete = value; }, asset, deletionCalls: () => deletionCalls };
}

test('creates owner-scoped download URLs only for the original and fixed variants', async () => {
  const { service, requestedKeys } = makeService();

  for (const [variant, expectedKey] of [
    ['original', `assets/${assetId}`],
    ['preview', `assets/${assetId}/preview`],
    ['thumbnail', `assets/${assetId}/thumbnail`],
  ] as const) {
    const result = await service.createDownloadUrl('owner-1', assetId, variant);
    assert.equal(result.assetId, assetId);
    assert.equal(result.variant, variant);
    assert.equal(result.download.url, 'https://storage.example.test/signed');
    assert.equal(requestedKeys.at(-1), expectedKey);
  }
});

test('keeps deletion retryable and never calls MinIO while a reference service is unavailable', async () => {
  const { service, cleanupEntries, asset, deletionCalls } = makeService();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env['STORAGE_MONITOR_TOKEN'];
  process.env['STORAGE_MONITOR_TOKEN'] = 'unit-test-storage-token';
  globalThis.fetch = async () => { throw new Error('service unavailable'); };
  try {
    await assert.rejects(service.deleteAsset('owner-1', assetId));
    assert.equal(asset.status, MediaAssetStatus.DELETING);
    assert.equal(deletionCalls(), 0);
    await (service as unknown as { cleanupExpired(): Promise<void> }).cleanupExpired();
    assert.equal(asset.status, MediaAssetStatus.DELETING);
    assert.equal(deletionCalls(), 0);
    assert.ok(cleanupEntries.every((entry) => (entry as { status: string }).status === 'RETRYABLE'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env['STORAGE_MONITOR_TOKEN']; else process.env['STORAGE_MONITOR_TOKEN'] = originalToken;
  }
});

test('rejects arbitrary download variants before asking storage to sign a key', async () => {
  const { service, requestedKeys } = makeService();

  await assert.rejects(
    service.createDownloadUrl('owner-1', assetId, '../private'),
    (error) => error instanceof BadRequestException,
  );
  assert.deepEqual(requestedKeys, []);
});

test('serves the sanitized image only to its owning user', async () => {
  const { service, readKeys } = makeService();
  const result = await service.getAssetContent('owner-1', assetId);
  assert.equal(result.mimeType, 'image/webp');
  assert.deepEqual(result.bytes, Buffer.from('sanitized webp'));
  assert.deepEqual(readKeys, [`assets/${assetId}`]);

  await assert.rejects(service.getAssetContent('owner-2', assetId));
  assert.deepEqual(readKeys, [`assets/${assetId}`]);
});

test('creates a private derived-media job and a transactional RabbitMQ outbox event', async () => {
  const { service, outboxEntries } = makeService();
  const result = await service.createBackgroundRemoval('owner-1', assetId);
  assert.equal(result.status, 'PENDING');
  assert.match(result.derivedAssetId, /^[0-9a-f-]{36}$/i);
  assert.equal(outboxEntries.length, 1);
  const event = outboxEntries[0] as { data: { eventType: string; aggregateId: string; payload: Record<string, unknown> } };
  assert.equal(event.data.eventType, 'media.background-removal.requested.v1');
  assert.equal(event.data.payload['sourceAssetId'], assetId);
  assert.equal(event.data.payload['derivedAssetId'], result.derivedAssetId);
});

test('does not delete a ready MinIO object when cross-service references cannot be verified', async () => {
  const { service, cleanupEntries, asset } = makeService();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env['STORAGE_MONITOR_TOKEN'];
  process.env['STORAGE_MONITOR_TOKEN'] = 'unit-test-storage-token';
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'REFERENCED' }), { status: 200 });
  try {
    await assert.rejects(service.deleteAsset('owner-1', assetId), (error: unknown) =>
      error instanceof Error && 'response' in error && (error as { response?: { code?: string } }).response?.code === 'MEDIA_ASSET_REFERENCED',
    );
    assert.equal(asset.status, MediaAssetStatus.READY);
    await (service as unknown as { cleanupExpired(): Promise<void> }).cleanupExpired();
    assert.equal(asset.status, MediaAssetStatus.READY);
    assert.equal(cleanupEntries.length, 1);
    assert.equal((cleanupEntries[0] as { status: string }).status, 'BLOCKED');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env['STORAGE_MONITOR_TOKEN']; else process.env['STORAGE_MONITOR_TOKEN'] = originalToken;
  }
});

test('deletes a Media object only after both reference services confirm it is unreferenced', async () => {
  const { service, asset, deletionCalls } = makeService();
  const originalFetch = globalThis.fetch;
  const originalToken = process.env['STORAGE_MONITOR_TOKEN'];
  process.env['STORAGE_MONITOR_TOKEN'] = 'unit-test-storage-token';
  let checkedServices = 0;
  globalThis.fetch = async () => { checkedServices += 1; return new Response(JSON.stringify({ status: 'UNREFERENCED' }), { status: 200 }); };
  try {
    const result = await service.deleteAsset('owner-1', assetId);
    assert.equal(result.status, MediaAssetStatus.DELETED);
    assert.equal(asset.status, MediaAssetStatus.DELETED);
    assert.equal(checkedServices, 2);
    assert.equal(deletionCalls(), 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env['STORAGE_MONITOR_TOKEN']; else process.env['STORAGE_MONITOR_TOKEN'] = originalToken;
  }
});
