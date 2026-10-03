ALTER TYPE "MediaAssetStatus" ADD VALUE IF NOT EXISTS 'DELETING';
ALTER TYPE "MediaAssetCategory" ADD VALUE IF NOT EXISTS 'PREVIEW';
ALTER TYPE "MediaAssetCategory" ADD VALUE IF NOT EXISTS 'PDF_FINAL';
ALTER TYPE "MediaAssetCategory" ADD VALUE IF NOT EXISTS 'ZIP_EXPORT';
ALTER TYPE "MediaAssetCategory" ADD VALUE IF NOT EXISTS 'TEMP_RENDER';
ALTER TYPE "MediaAssetCategory" ADD VALUE IF NOT EXISTS 'IMPORT_TEMP';
ALTER TYPE "MediaAssetCategory" ADD VALUE IF NOT EXISTS 'FAILED_JOB_ARTIFACT';
ALTER TABLE "media_assets" ADD COLUMN "preview_size_bytes" INTEGER;
ALTER TABLE "media_assets" ADD COLUMN "thumbnail_size_bytes" INTEGER;

CREATE TABLE "media_cleanup_entries" (
  "id" UUID NOT NULL,
  "file_id" UUID NOT NULL,
  "category" "MediaAssetCategory" NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "reason" VARCHAR(80) NOT NULL,
  "job_id" UUID,
  "status" VARCHAR(24) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_cleanup_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_cleanup_entries_created_at_idx" ON "media_cleanup_entries"("created_at" DESC);

CREATE INDEX "media_assets_expired_category_idx" ON "media_assets"("category", "expires_at") WHERE "expires_at" IS NOT NULL;
