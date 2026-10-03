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
  };
  const prisma = {
    mediaAsset: {
      findFirst: async ({ where }: { where: { ownerSubject: string; id: string } }) => {
        assert.equal(where.ownerSubject, 'owner-1');
        assert.equal(where.id, assetId);
        return asset;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(asset, data); return { count: 1 }; },
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      findMany: async ({ where }: { where?: { status?: MediaAssetStatus } }) => where?.status === MediaAssetStatus.DELETING ? [{ ...asset }] : [],
    },
    mediaTransformationJob: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: '660e8400-e29b-41d4-a716-446655440000', status: 'PENDING', ...data }),
    },
    mediaCleanupEntry: { create: async ({ data }: { data: unknown }) => { cleanupEntries.push(data); return data; } },
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
    deleteQuarantine: async () => { if (failObjectDelete) throw new Error('MinIO unavailable'); },
    deleteReady: async () => { if (failObjectDelete) throw new Error('MinIO unavailable'); },
    deleteVariants: async () => { if (failObjectDelete) throw new Error('MinIO unavailable'); },
  } as unknown as MediaStorage;
  return { service: new MediaService(prisma, storage), requestedKeys, readKeys, outboxEntries, cleanupEntries, setObjectDeleteFailure: (value: boolean) => { failObjectDelete = value; }, asset };
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

test('keeps a MinIO deletion retryable and finalizes it in a cleanup pass', async () => {
  const { service, cleanupEntries, setObjectDeleteFailure, asset } = makeService();
  setObjectDeleteFailure(true);
  await assert.rejects(service.deleteAsset('owner-1', assetId));
  assert.equal(asset.status, MediaAssetStatus.DELETING);
  setObjectDeleteFailure(false);
  await (service as unknown as { cleanupExpired(): Promise<void> }).cleanupExpired();
  assert.equal(asset.status, MediaAssetStatus.DELETED);
  assert.equal(cleanupEntries.length, 2);
  assert.ok(cleanupEntries.some((entry) => (entry as { status: string }).status === 'RETRYABLE'));
  assert.ok(cleanupEntries.some((entry) => (entry as { status: string }).status === 'DELETED'));
});
