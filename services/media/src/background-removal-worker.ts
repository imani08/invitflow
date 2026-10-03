import 'reflect-metadata';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { MediaAssetStatus, MediaTransformationStatus } from '../generated/prisma/client.js';
import { MediaStorage } from './media-storage.js';
import { PrismaService } from './prisma.service.js';

const prisma = new PrismaService();
const storage = new MediaStorage();
const rabbitUrl = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
const rabbitUser = process.env['RABBITMQ_USER'] ?? 'invitaflow';
const rabbitPassword = process.env['RABBITMQ_PASSWORD'] ?? '';
const providerUrl = process.env['BACKGROUND_REMOVAL_PROVIDER_URL'] ?? 'http://background-removal-provider:8080/v1/remove-background';
const timeoutSeconds = Number(process.env['BACKGROUND_REMOVAL_TIMEOUT_SECONDS'] ?? 120);
const maxBytes = Number(process.env['BACKGROUND_REMOVAL_MAX_IMAGE_MB'] ?? 10) * 1024 * 1024;
const maxPixels = Number(process.env['BACKGROUND_REMOVAL_MAX_PIXELS'] ?? 20_000_000);
let stopped = false;
let busy = false;

async function processNext(jobId?: string) {
  if (busy) return;
  busy = true;
  try {
    const job = jobId
      ? await prisma.mediaTransformationJob.findUnique({ where: { id: jobId } })
      : await prisma.mediaTransformationJob.findFirst({ where: { status: MediaTransformationStatus.PENDING }, orderBy: { createdAt: 'asc' } });
    if (!job || job.status !== MediaTransformationStatus.PENDING) return;
    const claimed = await prisma.mediaTransformationJob.updateMany({ where: { id: job.id, status: MediaTransformationStatus.PENDING }, data: { status: MediaTransformationStatus.PROCESSING, attempts: { increment: 1 }, errorCode: null } });
    if (!claimed.count) return;
    try {
      const source = await prisma.mediaAsset.findFirstOrThrow({ where: { id: job.sourceAssetId, ownerSubject: job.ownerSubject, status: MediaAssetStatus.READY, objectKey: { not: null } } });
      if (!source.objectKey || source.sizeBytes > maxBytes) throw new Error('IMAGE_TOO_LARGE');
      const input = await storage.readReady(source.objectKey, maxBytes);
      const metadata = await sharp(input, { limitInputPixels: maxPixels }).metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels) throw new Error('PIXEL_LIMIT');
      const response = await fetch(providerUrl, { method: 'POST', headers: { 'content-type': source.detectedMimeType ?? 'image/webp' }, body: new Uint8Array(input), signal: AbortSignal.timeout(timeoutSeconds * 1000) });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/png') throw new Error('PROVIDER_FAILED');
      const output = Buffer.from(await response.arrayBuffer());
      if (!output.length || output.length > 20 * 1024 * 1024) throw new Error('OUTPUT_TOO_LARGE');
      const png = sharp(output, { limitInputPixels: maxPixels });
      const result = await png.metadata();
      const stats = await png.stats();
      if (result.format !== 'png' || !result.width || !result.height || result.width * result.height > maxPixels || result.width !== metadata.width || result.height !== metadata.height || !result.hasAlpha || stats.channels.length < 4 || stats.channels[3]!.min >= 255) throw new Error('INVALID_TRANSPARENT_PNG');
      const objectKey = await storage.publishDerivedPng(job.derivedAssetId, output);
      await prisma.$transaction([
        prisma.mediaAsset.update({ where: { id: job.derivedAssetId }, data: { status: MediaAssetStatus.READY, objectKey, detectedMimeType: 'image/png', sizeBytes: output.length, width: result.width, height: result.height, sha256: createHash('sha256').update(output).digest('hex') } }),
        prisma.mediaTransformationJob.update({ where: { id: job.id }, data: { status: MediaTransformationStatus.READY, errorCode: null } }),
      ]);
      console.info(JSON.stringify({ event: 'background_removal_ready', jobId: job.id, derivedAssetId: job.derivedAssetId }));
    } catch (error) {
      const code = error instanceof Error && /^[A-Z_]{3,80}$/.test(error.message) ? error.message : 'BACKGROUND_REMOVAL_FAILED';
      await Promise.all([
        prisma.mediaTransformationJob.update({ where: { id: job.id }, data: { status: MediaTransformationStatus.FAILED, errorCode: code } }),
        prisma.mediaAsset.updateMany({ where: { id: job.derivedAssetId, status: MediaAssetStatus.PROCESSING }, data: { status: MediaAssetStatus.REJECTED, deletedAt: new Date(), sizeBytes: 0 } }),
      ]);
      console.warn(JSON.stringify({ event: 'background_removal_failed', jobId: job.id, derivedAssetId: job.derivedAssetId, code }));
    }
  } finally { busy = false; }
}

async function consumeHint() {
  try {
    const response = await fetch(`${rabbitUrl.replace(/\/$/, '')}/api/queues/%2F/media.background-removal.jobs/get`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${rabbitUser}:${rabbitPassword}`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ count: 1, ackmode: 'ack_requeue_false', encoding: 'auto', truncate: 16384 }), signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const messages: unknown = await response.json();
      if (Array.isArray(messages)) for (const message of messages) {
        try {
          const payload = JSON.parse(String((message as Record<string, unknown>)['payload'] ?? '{}')) as Record<string, unknown>;
          const envelope = payload['eventType'] === 'media.background-removal.requested.v1' ? payload['payload'] as Record<string, unknown> : {};
          if (typeof envelope['jobId'] === 'string') await processNext(envelope['jobId']);
        } catch { /* Persisted job records are the recovery source. */ }
      }
    }
  } catch { /* Persisted job records are the recovery source. */ }
  await processNext();
}

async function run() {
  await prisma.$connect();
  while (!stopped) {
    await consumeHint();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await prisma.$disconnect();
}
process.once('SIGTERM', () => { stopped = true; });
process.once('SIGINT', () => { stopped = true; });
void run().catch((error) => { console.error(JSON.stringify({ event: 'background_removal_worker_stopped', error: error instanceof Error ? error.message : 'unknown' })); process.exitCode = 1; });
