import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { AntivirusScanError, scanWithClamAV } from '../antivirus-scan.mjs';
import { ImageValidationError, inspectUserImage } from '../image-validation.mjs';
import { ImageTranscodeError, transcodeUserImage } from '../image-transcode.mjs';
import { MediaAssetCategory, MediaAssetPurpose, MediaAssetStatus, MediaTransformationStatus, MediaTransformationType } from '../generated/prisma/client.js';
import { shouldBlockLargeStorageOperation, storageLevel } from './storage-policy.mjs';
import { requiredEnv, validatedServicePort } from './env.js';
import { MediaStorage } from './media-storage.js';
import { PrismaService } from './prisma.service.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UPLOAD_INTENT_MINUTES = 10;
const storageEnvInt = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};

type CreateAssetInput = {
  filename?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  purpose?: unknown;
};

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaService.name);
  private readonly antivirusHost = requiredEnv('MEDIA_ANTIVIRUS_HOST');
  private readonly antivirusPort = validatedServicePort('MEDIA_ANTIVIRUS_PORT', 3310);
  private cleanupTimer?: NodeJS.Timeout;
  private cleanupLastRunAt: Date | null = null;
  private cleanupFailures = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorage,
  ) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(
      () =>
        void this.cleanupExpired().catch(() =>
          this.logger.warn('Expired media cleanup failed; it will retry'),
        ),
      60_000,
    );
    this.cleanupTimer.unref();
    void this.cleanupExpired().catch(() =>
      this.logger.warn('Initial expired media cleanup failed; it will retry'),
    );
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async createAsset(ownerSubject: string, value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some(
        (key) => !['filename', 'mimeType', 'sizeBytes', 'purpose'].includes(key),
      )
    ) {
      throw new BadRequestException('Champs de média non pris en charge.');
    }
    const input = value as CreateAssetInput;
    if (
      typeof input.filename !== 'string' ||
      typeof input.mimeType !== 'string' ||
      typeof input.sizeBytes !== 'number' ||
      !Number.isSafeInteger(input.sizeBytes)
    ) {
      throw new BadRequestException('Le nom, le type MIME et la taille du fichier sont requis.');
    }
    const filename = input.filename.split(/[\\/]/).at(-1)?.trim();
    if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename))
      throw new BadRequestException('Nom de fichier invalide.');
    const mimeType = input.mimeType.split(';', 1)[0]?.trim().toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType ?? ''))
      throw new BadRequestException('Seules les images PNG, JPEG et WebP sont acceptées.');
    if (input.sizeBytes < 1 || input.sizeBytes > MAX_IMAGE_BYTES)
      throw new BadRequestException('Une image doit peser au maximum 5 Mio.');
    if (input.sizeBytes >= 1024 * 1024) await this.assertStorageCapacity('un téléversement volumineux');
    if (
      typeof input.purpose !== 'string' ||
      !Object.values(MediaAssetPurpose).includes(input.purpose as MediaAssetPurpose)
    )
      throw new BadRequestException('L’usage du média est invalide.');

    const id = randomUUID();
    const asset = await this.prisma.mediaAsset.create({
      data: {
        id,
        ownerSubject,
        purpose: input.purpose as MediaAssetPurpose,
        originalName: filename,
        declaredMimeType: mimeType!,
        sizeBytes: input.sizeBytes,
        uploadKey: `incoming/${id}`,
        quarantineKey: `sealed/${id}`,
        intentExpiresAt: new Date(Date.now() + UPLOAD_INTENT_MINUTES * 60_000),
        uploadExpiresAt: new Date(Date.now() + UPLOAD_INTENT_MINUTES * 60_000),
      },
    });
    return this.publicAsset(asset);
  }

  async createUploadUrl(ownerSubject: string, id: string) {
    const asset = await this.ownedAsset(ownerSubject, id);
    const now = new Date();
    if (asset.status !== MediaAssetStatus.UPLOADING || asset.intentExpiresAt <= now)
      throw new ConflictException('Le délai de téléversement de ce média est expiré ou terminé.');
    if (!asset.uploadKey)
      throw new ConflictException('La clé de téléversement de ce média a expiré.');
    const expiresInSeconds = Math.max(
      1,
      Math.min(300, Math.floor((asset.intentExpiresAt.getTime() - now.getTime()) / 1000)),
    );
    const upload = await this.storage.createUploadUrl(
      asset.uploadKey,
      asset.declaredMimeType,
      asset.sizeBytes,
      expiresInSeconds,
    );
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);
    await this.prisma.mediaAsset.updateMany({
      where: {
        id: asset.id,
        ownerSubject,
        status: MediaAssetStatus.UPLOADING,
        uploadExpiresAt: { lt: expiresAt },
      },
      data: { uploadExpiresAt: expiresAt },
    });
    const latest = await this.ownedAsset(ownerSubject, id);
    if (latest.status !== MediaAssetStatus.UPLOADING || latest.uploadExpiresAt < expiresAt)
      throw new ConflictException('Le statut du média a changé pendant la création de son URL.');
    return { assetId: asset.id, status: asset.status, upload };
  }

  async completeUpload(ownerSubject: string, id: string) {
    const asset = await this.ownedAsset(ownerSubject, id);
    if (asset.status === MediaAssetStatus.QUARANTINED || asset.status === MediaAssetStatus.READY)
      return this.publicAsset(asset);
    if (asset.status !== MediaAssetStatus.UPLOADING || asset.uploadExpiresAt <= new Date())
      throw new ConflictException('Ce téléversement ne peut plus être confirmé.');
    const claimed = await this.prisma.mediaAsset.updateMany({
      where: {
        id: asset.id,
        ownerSubject,
        status: MediaAssetStatus.UPLOADING,
        uploadExpiresAt: { gt: new Date() },
      },
      data: { status: MediaAssetStatus.PROCESSING },
    });
    if (claimed.count === 0) {
      const latest = await this.ownedAsset(ownerSubject, id);
      if (
        latest.status === MediaAssetStatus.QUARANTINED ||
        latest.status === MediaAssetStatus.READY
      )
        return this.publicAsset(latest);
      throw new ConflictException('Le statut du média a changé pendant la confirmation.');
    }

    let committed = false;
    try {
      const claimedAsset = await this.ownedAsset(ownerSubject, id);
      if (!claimedAsset.uploadKey)
        throw new ConflictException('La clé de téléversement de ce média est introuvable.');
      const object = await this.storage.headQuarantine(claimedAsset.uploadKey);
      if (
        object.size !== claimedAsset.sizeBytes ||
        object.size > MAX_IMAGE_BYTES ||
        object.contentType !== claimedAsset.declaredMimeType
      ) {
        await this.rejectUpload(claimedAsset.id, claimedAsset.uploadKey);
        throw new BadRequestException(
          'La taille ou le type déclaré ne correspond pas au fichier envoyé.',
        );
      }
      const bytes = await this.storage.readQuarantine(
        claimedAsset.uploadKey,
        Math.min(claimedAsset.sizeBytes, MAX_IMAGE_BYTES),
      );
      if (bytes.length !== claimedAsset.sizeBytes) {
        await this.rejectUpload(claimedAsset.id, claimedAsset.uploadKey);
        throw new BadRequestException('La taille du fichier envoyé est incorrecte.');
      }

      try {
        inspectUserImage(bytes, claimedAsset.originalName, claimedAsset.declaredMimeType);
      } catch (error) {
        await this.rejectUpload(claimedAsset.id, claimedAsset.uploadKey);
        if (error instanceof ImageValidationError)
          throw new BadRequestException({ code: error.code, message: error.message });
        throw error;
      }

      try {
        await scanWithClamAV(bytes, {
          host: this.antivirusHost,
          port: this.antivirusPort,
        });
      } catch (error) {
        if (error instanceof AntivirusScanError && error.code === 'MALWARE_DETECTED') {
          await this.rejectUpload(claimedAsset.id, claimedAsset.uploadKey);
          throw new BadRequestException({ code: error.code, message: error.message });
        }
        if (error instanceof AntivirusScanError)
          throw new ServiceUnavailableException('Le contrôle antivirus est indisponible.');
        throw error;
      }

      let sanitized: Awaited<ReturnType<typeof transcodeUserImage>>;
      try {
        sanitized = await transcodeUserImage(bytes);
      } catch (error) {
        await this.rejectUpload(claimedAsset.id, claimedAsset.uploadKey);
        if (error instanceof ImageTranscodeError)
          throw new BadRequestException({ code: error.code, message: error.message });
        throw error;
      }

      const publishedKey = await this.storage.publishSanitized(claimedAsset.id, sanitized.bytes);
      await this.storage.publishVariant(claimedAsset.id, 'preview', sanitized.preview);
      await this.storage.publishVariant(claimedAsset.id, 'thumbnail', sanitized.thumbnail);
      const result = await this.prisma.mediaAsset.updateMany({
        where: { id: claimedAsset.id, ownerSubject, status: MediaAssetStatus.PROCESSING },
        data: {
          status: MediaAssetStatus.READY,
          detectedMimeType: sanitized.mimeType,
          sizeBytes: sanitized.bytes.length,
          width: sanitized.width,
          height: sanitized.height,
          sha256: createHash('sha256').update(sanitized.bytes).digest('hex'),
          objectKey: publishedKey,
          quarantineExpiresAt: null,
        },
      });
      if (result.count === 0)
        throw new ConflictException('Le statut du média a changé pendant sa mise en quarantaine.');
      committed = true;
      try {
        await this.storage.deleteQuarantine(claimedAsset.uploadKey);
        await this.prisma.mediaAsset.updateMany({
          where: {
            id: claimedAsset.id,
            ownerSubject,
            status: MediaAssetStatus.READY,
            uploadKey: claimedAsset.uploadKey,
          },
          data: { uploadKey: null },
        });
      } catch {
        this.logger.warn(`Original upload cleanup deferred for ${claimedAsset.id}`);
      }
      return this.publicAsset(await this.ownedAsset(ownerSubject, id));
    } catch (error) {
      if (!committed)
        await Promise.all([
          this.storage.deleteReady(`assets/${asset.id}`),
          this.storage.deleteVariants(asset.id),
        ]).catch(() => this.logger.warn(`Ready media cleanup deferred for ${asset.id}`));
      await this.prisma.mediaAsset.updateMany({
        where: { id: asset.id, ownerSubject, status: MediaAssetStatus.PROCESSING },
        data: {
          status:
            asset.uploadExpiresAt > new Date()
              ? MediaAssetStatus.UPLOADING
              : MediaAssetStatus.REJECTED,
        },
      });
      throw error;
    }
  }

  async createDownloadUrl(ownerSubject: string, id: string, variant = 'original') {
    const asset = await this.ownedAsset(ownerSubject, id);
    if (asset.status !== MediaAssetStatus.READY || !asset.objectKey || !asset.detectedMimeType)
      throw new ConflictException('Le média n’est pas encore prêt à être utilisé.');
    const keys: Record<string, string> = {
      original: asset.objectKey,
      preview: `assets/${asset.id}/preview`,
      thumbnail: `assets/${asset.id}/thumbnail`,
    };
    const key = keys[variant];
    if (!key) throw new BadRequestException('La variante du média est invalide.');
    return {
      assetId: asset.id,
      variant,
      download: await this.storage.createDownloadUrl(key),
    };
  }

  async deleteAsset(ownerSubject: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, ownerSubject, status: { not: MediaAssetStatus.DELETED } } });
    if (!asset) throw new NotFoundException('Média introuvable.');
    if (asset.status === MediaAssetStatus.DELETED) return { id: asset.id, status: asset.status };
    await this.prisma.mediaAsset.updateMany({ where: { id: asset.id, ownerSubject, status: { not: MediaAssetStatus.DELETED } }, data: { status: MediaAssetStatus.DELETING } });
    try {
      await this.deleteAssetObjects(asset);
      await this.finishAssetDelete(asset, 'USER_REQUEST');
      return { id: asset.id, status: MediaAssetStatus.DELETED };
    } catch {
      this.cleanupFailures += 1;
      this.logger.warn(`Media deletion deferred for ${asset.id}`);
      throw new ServiceUnavailableException('La suppression est enregistrée et sera réessayée.');
    }
  }

  async getAdminStorageStats() {
    const where = { status: MediaAssetStatus.READY, deletedAt: null };
    const [groups, totalFileCount, largestFiles, disk, deleted] = await Promise.all([
      this.prisma.mediaAsset.groupBy({ by: ['category'], where, _sum: { sizeBytes: true }, _count: { _all: true } }),
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({ where, orderBy: { sizeBytes: 'desc' }, take: 10, select: { id: true, originalName: true, category: true, sizeBytes: true, createdAt: true } }),
      this.getDiskStats(),
      this.prisma.mediaCleanupEntry.aggregate({ where: { deletedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, status: 'DELETED' }, _sum: { sizeBytes: true } }),
    ]);
    const categoryTotals = Object.fromEntries(groups.map((group) => [group.category, { bytes: group._sum.sizeBytes ?? 0, count: group._count._all }])) as Record<string, { bytes: number; count: number }>;
    const totalUsedBytes = Object.values(categoryTotals).reduce((sum, category) => sum + category.bytes, 0);
    const percentage = disk.totalBytes ? disk.usedBytes! / disk.totalBytes * 100 : null;
    const thresholds = { warning: storageEnvInt('STORAGE_WARNING_PERCENT', 70, 1, 97), serious: storageEnvInt('STORAGE_SERIOUS_PERCENT', 80, 2, 98), critical: storageEnvInt('STORAGE_CRITICAL_PERCENT', 90, 3, 99), emergency: storageEnvInt('STORAGE_EMERGENCY_PERCENT', 95, 4, 100) };
    let level: string;
    try { level = percentage === null ? 'UNKNOWN' : storageLevel(percentage, thresholds); } catch { level = storageLevel(percentage ?? -1); }
    return {
      disk: { ...disk, percentage, level, thresholds },
      application: { totalUsedBytes, totalFileCount, breakdownByCategory: {
        originals: categoryTotals['ORIGINAL_MEDIA'] ?? { bytes: 0, count: 0 },
        derived: categoryTotals['DERIVED_MEDIA'] ?? { bytes: 0, count: 0 },
        previews: categoryTotals['PREVIEW'] ?? { bytes: 0, count: 0 },
        pdfFinal: categoryTotals['PDF_FINAL'] ?? { bytes: 0, count: 0 },
        zip: categoryTotals['ZIP_EXPORT'] ?? { bytes: 0, count: 0 },
        temp: ['TEMP_RENDER', 'IMPORT_TEMP', 'FAILED_JOB_ARTIFACT'].reduce((sum, category) => ({ bytes: sum.bytes + (categoryTotals[category]?.bytes ?? 0), count: sum.count + (categoryTotals[category]?.count ?? 0) }), { bytes: 0, count: 0 }),
      }, breakdownByEvent: null, breakdownByAgency: null, largestFiles },
      cleanup: { deletedBytesLast24h: deleted._sum.sizeBytes ?? 0, failures: this.cleanupFailures, lastRunAt: this.cleanupLastRunAt?.toISOString() ?? null, nextRunAt: this.cleanupLastRunAt ? new Date(this.cleanupLastRunAt.getTime() + 60_000).toISOString() : null },
    };
  }

  private async getDiskStats() {
    try {
      const disk = await statfs(process.env['STORAGE_DISK_PATH'] ?? '/storage-volume');
      const totalBytes = Number(disk.blocks) * Number(disk.bsize);
      const freeBytes = Number(disk.bavail) * Number(disk.bsize);
      if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || !Number.isSafeInteger(freeBytes) || freeBytes < 0) throw new Error('Invalid filesystem counters');
      return { diskStatsAvailable: true, totalBytes, usedBytes: totalBytes - freeBytes, freeBytes };
    } catch {
      return { diskStatsAvailable: false, totalBytes: null, usedBytes: null, freeBytes: null };
    }
  }

  private async assertStorageCapacity(operation: string) {
    const disk = await this.getDiskStats();
    if (!disk.diskStatsAvailable || disk.totalBytes === null) return;
    const percentage = disk.usedBytes! / disk.totalBytes * 100;
    const thresholds = { warning: storageEnvInt('STORAGE_WARNING_PERCENT', 70, 1, 97), serious: storageEnvInt('STORAGE_SERIOUS_PERCENT', 80, 2, 98), critical: storageEnvInt('STORAGE_CRITICAL_PERCENT', 90, 3, 99), emergency: storageEnvInt('STORAGE_EMERGENCY_PERCENT', 95, 4, 100) };
    let blocked = false;
    try { blocked = shouldBlockLargeStorageOperation(percentage, thresholds); } catch { blocked = shouldBlockLargeStorageOperation(percentage); }
    if (blocked) throw new ConflictException({ code: 'STORAGE_CAPACITY_EMERGENCY', message: `Impossible de lancer ${operation} : le stockage serveur a atteint son seuil d’urgence.` });
  }

  private async deleteAssetObjects(asset: { id: string; uploadKey: string | null; quarantineKey: string; objectKey: string | null }) {
    if (asset.uploadKey) await this.storage.deleteQuarantine(asset.uploadKey);
    await this.storage.deleteQuarantine(asset.quarantineKey);
    if (asset.objectKey) await this.storage.deleteReady(asset.objectKey);
    await this.storage.deleteVariants(asset.id);
  }

  private async finishAssetDelete(asset: { id: string; category: MediaAssetCategory; sizeBytes: number; derivedJob?: { id: string } | null }, reason: string) {
    const deletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.mediaAsset.updateMany({ where: { id: asset.id, status: MediaAssetStatus.DELETING }, data: { status: MediaAssetStatus.DELETED, deletedAt, originalName: 'deleted', declaredMimeType: 'application/octet-stream', detectedMimeType: null, sizeBytes: 0, width: null, height: null, sha256: null, objectKey: null, uploadKey: null } }),
      this.prisma.mediaCleanupEntry.create({ data: { fileId: asset.id, category: asset.category, sizeBytes: asset.sizeBytes, reason, jobId: asset.derivedJob?.id ?? null, status: 'DELETED', deletedAt } }),
    ]);
  }

  async getAsset(ownerSubject: string, id: string) {
    return this.publicAsset(await this.ownedAsset(ownerSubject, id));
  }

  async getAssetContent(ownerSubject: string, id: string) {
    const asset = await this.ownedAsset(ownerSubject, id);
    if (asset.status !== MediaAssetStatus.READY || !asset.objectKey || !['image/webp', 'image/png'].includes(asset.detectedMimeType ?? ''))
      throw new ConflictException('Le média n’est pas prêt à être utilisé.');
    const bytes = await this.storage.readReady(asset.objectKey, 8 * 1024 * 1024);
    await this.prisma.mediaAsset.updateMany({ where: { id, ownerSubject, status: MediaAssetStatus.READY }, data: { lastAccessedAt: new Date() } });
    return { bytes, mimeType: asset.detectedMimeType };
  }

  async createBackgroundRemoval(ownerSubject: string, sourceId: string) {
    const source = await this.ownedAsset(ownerSubject, sourceId);
    if (source.status !== MediaAssetStatus.READY || source.purpose !== MediaAssetPurpose.PHOTO || source.detectedMimeType !== 'image/webp')
      throw new ConflictException('Une photo originale validée est nécessaire.');
    const existing = await this.prisma.mediaTransformationJob.findFirst({ where: { ownerSubject, sourceAssetId: sourceId, type: MediaTransformationType.BACKGROUND_REMOVAL, status: { in: [MediaTransformationStatus.PENDING, MediaTransformationStatus.PROCESSING, MediaTransformationStatus.READY] } }, orderBy: { createdAt: 'desc' } });
    if (existing) return { jobId: existing.id, status: existing.status, derivedAssetId: existing.derivedAssetId };
    const id = randomUUID();
    const job = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const derived = await tx.mediaAsset.create({ data: { id, ownerSubject, category: MediaAssetCategory.DERIVED_MEDIA, purpose: MediaAssetPurpose.GENERATED, status: MediaAssetStatus.PROCESSING, originalName: 'photo-detouree.png', declaredMimeType: 'image/png', sizeBytes: 0, quarantineKey: `derived/${id}`, intentExpiresAt: now, uploadExpiresAt: now, sourceAssetId: sourceId, transformationType: MediaTransformationType.BACKGROUND_REMOVAL } });
      const created = await tx.mediaTransformationJob.create({ data: { ownerSubject, sourceAssetId: sourceId, derivedAssetId: id, type: MediaTransformationType.BACKGROUND_REMOVAL } });
      await tx.outboxMessage.create({ data: { eventType: 'media.background-removal.requested.v1', aggregateId: created.id, payload: { jobId: created.id, sourceAssetId: sourceId, derivedAssetId: id, ownerSubject, schemaVersion: 1 } } });
      return { derived, created };
    });
    return { jobId: job.created.id, status: job.created.status, derivedAssetId: job.derived.id };
  }

  async getBackgroundRemoval(ownerSubject: string, sourceId: string) {
    const source = await this.ownedAsset(ownerSubject, sourceId);
    const job = await this.prisma.mediaTransformationJob.findFirst({ where: { ownerSubject, sourceAssetId: source.id, type: MediaTransformationType.BACKGROUND_REMOVAL }, orderBy: { createdAt: 'desc' } });
    if (!job) return { status: 'NONE' };
    const derived = await this.ownedAsset(ownerSubject, job.derivedAssetId);
    return { jobId: job.id, status: job.status, errorCode: job.errorCode, derivedAssetId: job.derivedAssetId, mimeType: derived.detectedMimeType, width: derived.width, height: derived.height };
  }

  async listAssets(ownerSubject: string, rawLimit?: string, cursor?: string) {
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (
      cursor !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor)
    )
      throw new BadRequestException('Le curseur du média est invalide.');
    const where = { ownerSubject, status: { not: MediaAssetStatus.DELETED } };
    if (
      cursor &&
      !(await this.prisma.mediaAsset.findFirst({
        where: { id: cursor, ...where },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Le curseur ne correspond pas à un média du compte.');
    const rows = await this.prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((asset) => this.publicAsset(asset));
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  private async ownedAsset(ownerSubject: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, ownerSubject, status: { not: MediaAssetStatus.DELETED } },
    });
    if (!asset) throw new NotFoundException('Média introuvable.');
    return asset;
  }

  private async rejectUpload(id: string, key: string) {
    await this.storage
      .deleteQuarantine(key)
      .catch(() => this.logger.warn(`Rejected media object cleanup deferred for ${id}`));
    await this.prisma.mediaAsset.updateMany({
      where: { id, status: MediaAssetStatus.PROCESSING },
      data: { status: MediaAssetStatus.REJECTED },
    });
  }

  private async cleanupExpired() {
    const expiredUploadKeys = await this.prisma.mediaAsset.findMany({
      where: { uploadKey: { not: null }, uploadExpiresAt: { lt: new Date() } },
      orderBy: { uploadExpiresAt: 'asc' },
      take: 100,
      select: { id: true, uploadKey: true },
    });
    for (const asset of expiredUploadKeys) {
      if (!asset.uploadKey) continue;
      try {
        await this.storage.deleteQuarantine(asset.uploadKey);
        await this.prisma.mediaAsset.updateMany({
          where: { id: asset.id, uploadKey: asset.uploadKey },
          data: { uploadKey: null },
        });
      } catch {
        this.logger.warn(`Expired upload cleanup deferred for ${asset.id}`);
      }
    }

    const expired = await this.prisma.mediaAsset.findMany({
      where: {
        OR: [
          {
            status: {
              in: [
                MediaAssetStatus.UPLOADING,
                MediaAssetStatus.PROCESSING,
                MediaAssetStatus.REJECTED,
              ],
            },
            intentExpiresAt: { lt: new Date() },
          },
          { status: MediaAssetStatus.QUARANTINED, quarantineExpiresAt: { lt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, uploadKey: true, quarantineKey: true, status: true },
    });
    for (const asset of expired) {
      try {
        if (asset.uploadKey) await this.storage.deleteQuarantine(asset.uploadKey);
        await this.storage.deleteQuarantine(asset.quarantineKey);
        await this.prisma.mediaAsset.deleteMany({
          where: {
            id: asset.id,
            OR: [
              {
                status: {
                  in: [
                    MediaAssetStatus.UPLOADING,
                    MediaAssetStatus.PROCESSING,
                    MediaAssetStatus.REJECTED,
                  ],
                },
                intentExpiresAt: { lt: new Date() },
              },
              { status: MediaAssetStatus.QUARANTINED, quarantineExpiresAt: { lt: new Date() } },
            ],
          },
        });
      } catch {
        this.logger.warn(`Expired media cleanup deferred for ${asset.id}`);
      }
    }
  }

  private publicAsset(asset: {
    id: string;
    purpose: MediaAssetPurpose;
    status: MediaAssetStatus;
    originalName: string;
    declaredMimeType: string;
    detectedMimeType: string | null;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    sha256: string | null;
    createdAt: Date;
    intentExpiresAt: Date;
    uploadExpiresAt: Date;
    quarantineExpiresAt: Date | null;
  }) {
    return {
      id: asset.id,
      purpose: asset.purpose,
      status: asset.status,
      filename: asset.originalName,
      declaredMimeType: asset.declaredMimeType,
      detectedMimeType: asset.detectedMimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      createdAt: asset.createdAt,
      expiresAt:
        asset.status === MediaAssetStatus.READY
          ? null
          : asset.status === MediaAssetStatus.QUARANTINED
            ? asset.quarantineExpiresAt
            : asset.intentExpiresAt,
    };
  }
}
