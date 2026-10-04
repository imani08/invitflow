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
import { MediaAssetCategory, MediaAssetPurpose, MediaAssetStatus, MediaTransformationStatus, MediaTransformationType, Prisma } from '../generated/prisma/client.js';
import { storageLevel } from './storage-policy.mjs';
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
  private inventoryRunning = false;

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
          previewSizeBytes: sanitized.preview.length,
          thumbnailSizeBytes: sanitized.thumbnail.length,
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
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, ownerSubject, status: { not: MediaAssetStatus.DELETED } }, include: { derivedJob: { select: { id: true } } } });
    if (!asset) throw new NotFoundException('Média introuvable.');
    if (asset.status === MediaAssetStatus.DELETED) return { id: asset.id, status: asset.status };
    if (asset.status === MediaAssetStatus.DELETING) return { id: asset.id, status: asset.status };
    const claimed = await this.prisma.mediaAsset.updateMany({ where: { id: asset.id, ownerSubject, status: asset.status }, data: { status: MediaAssetStatus.DELETING } });
    if (!claimed.count) throw new ConflictException('Une opération de stockage est déjà en cours pour ce média.');
    try {
      if (asset.objectKey) {
        const reference = await this.checkStorageReferences(asset.id, asset.objectKey);
        if (reference === 'REFERENCED') {
          await this.prisma.mediaAsset.updateMany({ where: { id: asset.id, status: MediaAssetStatus.DELETING }, data: { status: MediaAssetStatus.READY } });
          await this.prisma.mediaCleanupEntry.create({ data: { fileId: asset.id, category: asset.category, sizeBytes: asset.sizeBytes, reason: 'REFERENCE_PRESENT', jobId: asset.derivedJob?.id ?? null, status: 'BLOCKED' } });
          throw new ConflictException({ code: 'MEDIA_ASSET_REFERENCED', message: 'Ce fichier est encore référencé par un design ou une invitation.' });
        }
      }
      await this.deleteAssetObjects(asset);
      await this.finishAssetDelete(asset, 'USER_REQUEST');
      return { id: asset.id, status: MediaAssetStatus.DELETED };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.cleanupFailures += 1;
      await this.recordCleanupFailure(asset, 'USER_REQUEST');
      this.logger.warn(`Media deletion deferred for ${asset.id}`);
      throw new ServiceUnavailableException('La suppression est en attente de vérification des références ou de stockage; elle sera réessayée.');
    }
  }

  async getAdminStorageStats() {
    const where = { status: MediaAssetStatus.READY, deletedAt: null };
    const [groups, totalFileCount, previewCount, thumbnailCount, previewSizes, largestFiles, disk, deleted, referenceBlocked] = await Promise.all([
      this.prisma.mediaAsset.groupBy({ by: ['category'], where, _sum: { sizeBytes: true }, _count: { _all: true } }),
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.count({ where: { ...where, previewSizeBytes: { not: null } } }),
      this.prisma.mediaAsset.count({ where: { ...where, thumbnailSizeBytes: { not: null } } }),
      this.prisma.mediaAsset.aggregate({ where, _sum: { previewSizeBytes: true, thumbnailSizeBytes: true } }),
      this.prisma.mediaAsset.findMany({ where, orderBy: { sizeBytes: 'desc' }, take: 10, select: { id: true, originalName: true, category: true, sizeBytes: true, createdAt: true } }),
      this.getDiskStats(),
      this.prisma.mediaCleanupEntry.aggregate({ where: { deletedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, status: 'DELETED' }, _sum: { sizeBytes: true } }),
      this.prisma.mediaCleanupEntry.count({ where: { status: 'BLOCKED', reason: 'REFERENCE_PRESENT' } }),
    ]);
    const categoryTotals = Object.fromEntries(groups.map((group) => [group.category, { bytes: group._sum.sizeBytes ?? 0, count: group._count._all }])) as Record<string, { bytes: number; count: number }>;
    const previewBytes = (previewSizes._sum.previewSizeBytes ?? 0) + (previewSizes._sum.thumbnailSizeBytes ?? 0);
    const totalUsedBytes = Object.values(categoryTotals).reduce((sum, category) => sum + category.bytes, 0) + previewBytes;
    const percentage = disk.totalBytes ? disk.usedBytes! / disk.totalBytes * 100 : null;
    const thresholds = { warning: storageEnvInt('STORAGE_WARNING_PERCENT', 70, 1, 97), serious: storageEnvInt('STORAGE_SERIOUS_PERCENT', 80, 2, 98), critical: storageEnvInt('STORAGE_CRITICAL_PERCENT', 90, 3, 99), emergency: storageEnvInt('STORAGE_EMERGENCY_PERCENT', 95, 4, 100) };
    let level: string;
    try { level = percentage === null ? 'UNKNOWN' : storageLevel(percentage, thresholds); } catch { level = storageLevel(percentage ?? -1); }
    const [lastInventory, lastInventoryAttempt] = await Promise.all([
      this.prisma.storageInventorySnapshot.findFirst({ where: { status: { in: ['COMPLETE', 'INCOMPLETE'] } }, orderBy: { measuredAt: 'desc' } }),
      this.prisma.storageInventorySnapshot.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);
    return {
      disk: { ...disk, percentage, level, thresholds },
      minio: lastInventory ? { status: lastInventory.status, measuredAt: lastInventory.measuredAt?.toISOString() ?? null, validUntil: lastInventory.validUntil?.toISOString() ?? null, fresh: lastInventory.status === 'COMPLETE' && Boolean(lastInventory.validUntil && lastInventory.validUntil > new Date()), totalBytes: lastInventory.totalBytes === null ? null : Number(lastInventory.totalBytes), objectCount: lastInventory.objectCount === null ? null : Number(lastInventory.objectCount), summary: lastInventory.summary } : null,
      inventory: { lastAttemptAt: lastInventoryAttempt?.startedAt.toISOString() ?? null, lastAttemptStatus: lastInventoryAttempt?.status ?? null, lastErrorCode: lastInventoryAttempt?.errorCode ?? null, running: this.inventoryRunning },
      application: { totalUsedBytes, totalFileCount: totalFileCount + previewCount + thumbnailCount, breakdownByCategory: {
        originals: categoryTotals['ORIGINAL_MEDIA'] ?? { bytes: 0, count: 0 },
        derived: categoryTotals['DERIVED_MEDIA'] ?? { bytes: 0, count: 0 },
        previews: { bytes: previewBytes + (categoryTotals['PREVIEW']?.bytes ?? 0), count: previewCount + thumbnailCount + (categoryTotals['PREVIEW']?.count ?? 0) },
        pdfFinal: categoryTotals['PDF_FINAL'] ?? { bytes: 0, count: 0 },
        zip: categoryTotals['ZIP_EXPORT'] ?? { bytes: 0, count: 0 },
        temp: ['TEMP_RENDER', 'IMPORT_TEMP', 'FAILED_JOB_ARTIFACT'].reduce((sum, category) => ({ bytes: sum.bytes + (categoryTotals[category]?.bytes ?? 0), count: sum.count + (categoryTotals[category]?.count ?? 0) }), { bytes: 0, count: 0 }),
      }, breakdownByEvent: null, breakdownByAgency: null, largestFiles },
      cleanup: { deletedBytesLast24h: deleted._sum.sizeBytes ?? 0, failures: this.cleanupFailures + await this.prisma.mediaCleanupEntry.count({ where: { status: 'RETRYABLE' } }), referenceBlocked, pendingDeletion: await this.prisma.mediaAsset.count({ where: { status: MediaAssetStatus.DELETING } }), lastRunAt: this.cleanupLastRunAt?.toISOString() ?? null, nextRunAt: this.cleanupLastRunAt ? new Date(this.cleanupLastRunAt.getTime() + 60_000).toISOString() : null },
    };
  }

  async refreshMinioInventory(actor: string) {
    if (this.inventoryRunning) throw new ConflictException({ code: 'STORAGE_INVENTORY_RUNNING', message: 'Un inventaire MinIO est déjà en cours.' });
    const now = new Date();
    const recent = await this.prisma.storageInventorySnapshot.findFirst({ where: { startedAt: { gt: new Date(now.getTime() - 60_000) } }, orderBy: { startedAt: 'desc' } });
    if (recent) throw new ConflictException({ code: 'STORAGE_INVENTORY_RATE_LIMITED', message: 'Un nouvel inventaire ne peut être lancé qu’après une minute.' });
    const attempt = await this.prisma.storageInventorySnapshot.create({ data: { status: 'RUNNING', summary: { requestedBy: actor } } });
    this.inventoryRunning = true;
    try {
      const buckets = (process.env['MINIO_STORAGE_AUDIT_BUCKETS'] ?? 'media,media-quarantine,previews,generated,temporary,invitations').split(',').map((bucket) => bucket.trim()).filter(Boolean);
      if (!buckets.length || buckets.some((bucket) => !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))) throw new Error('INVALID_BUCKET_CONFIGURATION');
      const bucketData: Record<string, { bytes: number | null; objectCount: number; complete: boolean }> = {};
      const objectSets: Record<string, Array<{ key: string; sizeBytes: number }>> = {};
      let complete = true;
      for (const bucket of buckets) {
        const listing = await this.storage.listBucketObjects(bucket);
        objectSets[bucket] = listing.objects;
        const bytes = listing.objects.reduce((sum, object) => sum + object.sizeBytes, 0);
        bucketData[bucket] = { bytes: listing.complete ? bytes : null, objectCount: listing.objects.length, complete: listing.complete };
        complete &&= listing.complete;
      }
      const category = (keys: Array<{ key: string; sizeBytes: number }>) => keys.reduce((sum, entry) => ({ bytes: sum.bytes + entry.sizeBytes, count: sum.count + 1 }), { bytes: 0, count: 0 });
      const mediaObjects = objectSets['media'] ?? [];
      const invitationObjects = objectSets['invitations'] ?? [];
      const knownAssets = await this.prisma.mediaAsset.findMany({ where: { status: { not: MediaAssetStatus.DELETED } }, select: { id: true, objectKey: true, category: true, previewSizeBytes: true, thumbnailSizeBytes: true } });
      const assetsById = new Map(knownAssets.map((asset) => [asset.id, asset]));
      const regularMediaObjects = mediaObjects.filter((object) => /^assets\/[0-9a-f-]{36}$/i.test(object.key));
      const byCategory = {
        originals: category(regularMediaObjects.filter((object) => assetsById.get(object.key.split('/')[1]!)?.category === MediaAssetCategory.ORIGINAL_MEDIA)),
        derived: category(regularMediaObjects.filter((object) => assetsById.get(object.key.split('/')[1]!)?.category === MediaAssetCategory.DERIVED_MEDIA)),
        mediaUnclassified: category(regularMediaObjects.filter((object) => !assetsById.has(object.key.split('/')[1]!))),
        previews: category([...(objectSets['previews'] ?? []), ...mediaObjects.filter((object) => /^assets\/[0-9a-f-]{36}\/(?:preview|thumbnail)$/i.test(object.key))]),
        pdfFinal: category(invitationObjects.filter((object) => object.key.startsWith('pdf/'))),
        zip: category(invitationObjects.filter((object) => /^batches\/[0-9a-f-]{36}\.zip$/i.test(object.key))),
        temp: category([...(objectSets['temporary'] ?? []), ...(objectSets['media-quarantine'] ?? [])]),
        generatedUnclassified: category(objectSets['generated'] ?? []),
      };
      const expectedKeys = new Set<string>();
      for (const asset of knownAssets) {
        if (asset.objectKey) expectedKeys.add(asset.objectKey);
        if (asset.previewSizeBytes !== null) expectedKeys.add(`assets/${asset.id}/preview`);
        if (asset.thumbnailSizeBytes !== null) expectedKeys.add(`assets/${asset.id}/thumbnail`);
      }
      const actualKeys = new Set(mediaObjects.map((object) => object.key));
      const mediaKeyRe = /^assets\/[0-9a-f-]{36}(?:\/(?:preview|thumbnail))?$/i;
      const metadataMissing = [...expectedKeys].filter((key) => mediaKeyRe.test(key) && !actualKeys.has(key));
      const untrackedObjects = mediaObjects.filter((object) => mediaKeyRe.test(object.key) && !expectedKeys.has(object.key));
      let invitationMetadataAvailable = false;
      let invitationPdfKeys = new Set<string>();
      let invitationZipKeys = new Set<string>();
      let expiredZipKeys = new Set<string>();
      let unknownZipSizeCount: number | null = null;
      try {
        const metadata = await this.loadInvitationObjectMetadata();
        invitationMetadataAvailable = metadata.complete;
        invitationPdfKeys = metadata.pdfKeys;
        invitationZipKeys = metadata.zipKeys;
        expiredZipKeys = metadata.expiredZipKeys;
        unknownZipSizeCount = metadata.unknownZipSizeCount;
      } catch { /* S3 inventory remains usable; cross-service reconciliation stays UNKNOWN. */ }
      const zipObjects = invitationObjects.filter((object) => /^batches\/[0-9a-f-]{36}\.zip$/i.test(object.key));
      const actualInvitationKeys = new Set(invitationObjects.map((object) => object.key));
      const invitationMetadataMissing = invitationMetadataAvailable ? [...invitationPdfKeys, ...invitationZipKeys].filter((key) => !actualInvitationKeys.has(key)) : null;
      const untrackedInvitationObjects = invitationMetadataAvailable ? invitationObjects.filter((object) => /^(?:pdf\/|batches\/.*\.zip$)/i.test(object.key) && !invitationPdfKeys.has(object.key) && !invitationZipKeys.has(object.key)) : null;
      const expiredZipObjectsPresent = invitationMetadataAvailable ? zipObjects.filter((object) => expiredZipKeys.has(object.key)).length : null;
      const expiredPreviewCandidateCount = await this.prisma.mediaAsset.count({ where: { status: MediaAssetStatus.READY, previewSizeBytes: { not: null }, updatedAt: { lt: new Date(Date.now() - storageEnvInt('STORAGE_PREVIEW_TTL_DAYS', 30, 1, 3650) * 24 * 60 * 60 * 1000) } } });
      const totalBytes = complete ? Object.values(bucketData).reduce((sum, bucket) => sum + (bucket.bytes ?? 0), 0) : null;
      const objectCount = Object.values(bucketData).reduce((sum, bucket) => sum + bucket.objectCount, 0);
      const measuredAt = new Date();
      const validUntil = new Date(measuredAt.getTime() + storageEnvInt('STORAGE_INVENTORY_TTL_SECONDS', 900, 60, 86_400) * 1000);
      const summary = { complete, buckets: bucketData, categories: complete ? byCategory : null, reconciliation: { mediaMetadataObjectsMissingInMinio: metadataMissing.length, mediaObjectsWithoutMetadata: untrackedObjects.length, mediaMetadataMissingSamples: metadataMissing.slice(0, 50), mediaOrphanSamples: untrackedObjects.slice(0, 50).map(({ key }) => key), invitationMetadataAvailable, invitationMetadataObjectsMissingInMinio: invitationMetadataMissing?.length ?? null, invitationObjectsWithoutMetadata: untrackedInvitationObjects?.length ?? null, expiredZipObjectsPresent, unknownInvitationZipSizeCount: unknownZipSizeCount, expiredPreviewCandidateCount, deletionAutomatic: false }, requestedBy: actor };
      return await this.prisma.storageInventorySnapshot.update({ where: { id: attempt.id }, data: { status: complete ? 'COMPLETE' : 'INCOMPLETE', measuredAt, validUntil, totalBytes: totalBytes === null ? null : BigInt(totalBytes), objectCount: BigInt(objectCount), summary: summary as Prisma.InputJsonValue } });
    } catch (error) {
      await this.prisma.storageInventorySnapshot.update({ where: { id: attempt.id }, data: { status: 'FAILED', errorCode: error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : 'MINIO_INVENTORY_FAILED' } });
      throw new ServiceUnavailableException('L’inventaire MinIO a échoué; les objets ambigus ne seront pas supprimés.');
    } finally { this.inventoryRunning = false; }
  }

  private async checkStorageReferences(assetId: string, objectKey: string): Promise<'REFERENCED' | 'UNREFERENCED'> {
    const token = requiredEnv('STORAGE_MONITOR_TOKEN');
    const baseUrls = [requiredEnv('DESIGNS_SERVICE_URL', 'http://designs:3007'), requiredEnv('INVITATIONS_SERVICE_URL', 'http://invitations:3013')];
    const checks = await Promise.all(baseUrls.map(async (baseUrl) => {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/internal/storage/reference-check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-storage-monitor-token': token },
        body: JSON.stringify({ assetId, objectKey }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error('REFERENCE_SERVICE_UNAVAILABLE');
      const body = await response.json() as { status?: unknown };
      if (body.status !== 'REFERENCED' && body.status !== 'UNREFERENCED') throw new Error('REFERENCE_RESULT_UNKNOWN');
      return body.status;
    }));
    return checks.some((status) => status === 'REFERENCED') ? 'REFERENCED' : 'UNREFERENCED';
  }

  private async loadInvitationObjectMetadata() {
    const pdfKeys = new Set<string>();
    const zipKeys = new Set<string>();
    const expiredZipKeys = new Set<string>();
    let unknownZipSizeCount = 0;
    let pdfCursor: string | undefined;
    let zipCursor: string | undefined;
    const token = requiredEnv('STORAGE_MONITOR_TOKEN');
    for (let page = 0; page < 200; page += 1) {
      const query = new URLSearchParams();
      if (pdfCursor) query.set('pdfCursor', pdfCursor);
      if (zipCursor) query.set('zipCursor', zipCursor);
      const response = await fetch(`${requiredEnv('INVITATIONS_SERVICE_URL', 'http://invitations:3013').replace(/\/$/, '')}/v1/internal/storage/object-keys${query.size ? `?${query}` : ''}`, { headers: { 'x-storage-monitor-token': token }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('INVITATIONS_METADATA_UNAVAILABLE');
      const result = await response.json() as { pdfKeys?: unknown; zipKeys?: unknown; nextPdfCursor?: unknown; nextZipCursor?: unknown };
      if (!Array.isArray(result.pdfKeys) || !Array.isArray(result.zipKeys)) throw new Error('INVITATIONS_METADATA_INVALID');
      for (const key of result.pdfKeys) {
        if (typeof key !== 'string' || !/^pdf\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(key)) throw new Error('INVITATIONS_METADATA_INVALID');
        pdfKeys.add(key);
      }
      for (const row of result.zipKeys) {
        if (!row || typeof row !== 'object') throw new Error('INVITATIONS_METADATA_INVALID');
        const item = row as { key?: unknown; expiresAt?: unknown; sizeKnown?: unknown };
        if (typeof item.key !== 'string' || !/^batches\/[0-9a-f-]{36}\.zip$/i.test(item.key) || typeof item.expiresAt !== 'string' || typeof item.sizeKnown !== 'boolean') throw new Error('INVITATIONS_METADATA_INVALID');
        zipKeys.add(item.key);
        if (Date.parse(item.expiresAt) <= Date.now()) expiredZipKeys.add(item.key);
        if (!item.sizeKnown) unknownZipSizeCount += 1;
      }
      const nextPdfCursor = typeof result.nextPdfCursor === 'string' ? result.nextPdfCursor : undefined;
      const nextZipCursor = typeof result.nextZipCursor === 'string' ? result.nextZipCursor : undefined;
      if (!nextPdfCursor && !nextZipCursor) return { pdfKeys, zipKeys, expiredZipKeys, unknownZipSizeCount, complete: true };
      if (nextPdfCursor === pdfCursor && nextZipCursor === zipCursor) throw new Error('INVITATIONS_CURSOR_STALLED');
      pdfCursor = nextPdfCursor;
      zipCursor = nextZipCursor;
    }
    return { pdfKeys, zipKeys, expiredZipKeys, unknownZipSizeCount, complete: false };
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
    const capacity = await this.storageCapacityStatus();
    if (capacity.blocked) throw new ConflictException({ code: 'STORAGE_CAPACITY_EMERGENCY', message: `Impossible de lancer ${operation} : le stockage serveur a atteint son seuil d’urgence.` });
  }

  async storageCapacityStatus() {
    const disk = await this.getDiskStats();
    const thresholds = { warning: storageEnvInt('STORAGE_WARNING_PERCENT', 70, 1, 97), serious: storageEnvInt('STORAGE_SERIOUS_PERCENT', 80, 2, 98), critical: storageEnvInt('STORAGE_CRITICAL_PERCENT', 90, 3, 99), emergency: storageEnvInt('STORAGE_EMERGENCY_PERCENT', 95, 4, 100) };
    const percentage = disk.totalBytes ? disk.usedBytes! / disk.totalBytes * 100 : null;
    let level = 'UNKNOWN';
    try { if (percentage !== null) level = storageLevel(percentage, thresholds); } catch { if (percentage !== null) level = storageLevel(percentage); }
    return { diskStatsAvailable: disk.diskStatsAvailable, percentage, level, blocked: level === 'EMERGENCY', emergencyPercent: thresholds.emergency };
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
      this.prisma.mediaCleanupEntry.updateMany({ where: { fileId: asset.id, status: { in: ['RETRYABLE', 'BLOCKED'] } }, data: { status: 'RESOLVED' } }),
      this.prisma.mediaCleanupEntry.create({ data: { fileId: asset.id, category: asset.category, sizeBytes: asset.sizeBytes, reason, jobId: asset.derivedJob?.id ?? null, status: 'DELETED', deletedAt } }),
    ]);
  }

  private async recordCleanupFailure(asset: { id: string; category: MediaAssetCategory; sizeBytes: number; derivedJob?: { id: string } | null }, reason: string) {
    await this.prisma.mediaCleanupEntry.create({ data: { fileId: asset.id, category: asset.category, sizeBytes: asset.sizeBytes, reason, jobId: asset.derivedJob?.id ?? null, status: 'RETRYABLE' } }).catch(() => undefined);
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
    await this.assertStorageCapacity('un traitement de détourage');
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
    const where = { ownerSubject, status: { notIn: [MediaAssetStatus.DELETED, MediaAssetStatus.DELETING] } };
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
      where: { id, ownerSubject, status: { notIn: [MediaAssetStatus.DELETED, MediaAssetStatus.DELETING] } },
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
    this.cleanupLastRunAt = new Date();
    const batchSize = storageEnvInt('STORAGE_CLEANUP_BATCH_SIZE', 100, 1, 1000);
    const deleting = await this.prisma.mediaAsset.findMany({ where: { status: MediaAssetStatus.DELETING }, orderBy: { updatedAt: 'asc' }, take: batchSize, include: { derivedJob: { select: { id: true } } } });
    for (const asset of deleting) {
      try {
        if (asset.objectKey) {
          const references = await this.checkStorageReferences(asset.id, asset.objectKey);
          if (references === 'REFERENCED') {
            await this.prisma.mediaAsset.updateMany({ where: { id: asset.id, status: MediaAssetStatus.DELETING }, data: { status: MediaAssetStatus.READY } });
            await this.prisma.mediaCleanupEntry.create({ data: { fileId: asset.id, category: asset.category, sizeBytes: asset.sizeBytes, reason: 'REFERENCE_PRESENT', jobId: asset.derivedJob?.id ?? null, status: 'BLOCKED' } });
            continue;
          }
        }
        await this.deleteAssetObjects(asset);
        await this.finishAssetDelete(asset, 'RETRY');
      } catch {
        this.cleanupFailures += 1;
        await this.recordCleanupFailure(asset, 'RETRY');
        this.logger.warn(`Media deletion retry deferred for ${asset.id}`);
      }
    }
    const expiredUploadKeys = await this.prisma.mediaAsset.findMany({
      where: { uploadKey: { not: null }, uploadExpiresAt: { lt: new Date() } },
      orderBy: { uploadExpiresAt: 'asc' },
      take: batchSize,
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
      take: batchSize,
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
