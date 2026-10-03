CREATE TYPE "MediaTransformationStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "MediaTransformationType" AS ENUM ('BACKGROUND_REMOVAL');
CREATE TYPE "MediaAssetCategory" AS ENUM ('ORIGINAL_MEDIA', 'DERIVED_MEDIA');

ALTER TABLE "media_assets"
  ADD COLUMN "category" "MediaAssetCategory" NOT NULL DEFAULT 'ORIGINAL_MEDIA',
  ADD COLUMN "source_asset_id" UUID,
  ADD COLUMN "transformation_type" "MediaTransformationType",
  ADD COLUMN "expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_accessed_at" TIMESTAMPTZ(3),
  ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_asset_id_fkey"
  FOREIGN KEY ("source_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "media_assets_source_asset_id_idx" ON "media_assets"("source_asset_id");

CREATE TABLE "media_transformation_jobs" (
  "id" UUID NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL,
  "source_asset_id" UUID NOT NULL,
  "derived_asset_id" UUID NOT NULL,
  "type" "MediaTransformationType" NOT NULL,
  "status" "MediaTransformationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "media_transformation_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_transformation_jobs_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "media_transformation_jobs_derived_asset_id_fkey" FOREIGN KEY ("derived_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "media_transformation_jobs_derived_asset_id_key" ON "media_transformation_jobs"("derived_asset_id");
CREATE INDEX "media_transform_jobs_status_created_idx" ON "media_transformation_jobs"("status", "created_at");

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");
