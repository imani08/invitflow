import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { MediaAssetPurpose, MediaAssetStatus } from '../generated/prisma/client.js';
import { MediaService } from './media.service.js';
import type { MediaStorage } from './media-storage.js';
import type { PrismaService } from './prisma.service.js';

const assetId = '550e8400-e29b-41d4-a716-446655440000';

function makeService() {
  process.env['MEDIA_ANTIVIRUS_HOST'] = '127.0.0.1';
  process.env['MEDIA_ANTIVIRUS_PORT'] = '3310';
  const requestedKeys: string[] = [];
  const asset = {
    id: assetId,
    ownerSubject: 'owner-1',
    purpose: MediaAssetPurpose.PHOTO,
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
    },
  } as unknown as PrismaService;
  const storage = {
    createDownloadUrl: async (key: string) => {
      requestedKeys.push(key);
      return { url: 'https://storage.example.test/signed', method: 'GET' };
    },
  } as unknown as MediaStorage;
  return { service: new MediaService(prisma, storage), requestedKeys };
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
