CREATE TYPE "MediaAssetPurpose" AS ENUM ('PHOTO', 'LOGO', 'BACKGROUND', 'GENERATED', 'THUMBNAIL');
CREATE TYPE "MediaAssetStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'QUARANTINED', 'READY', 'REJECTED', 'DELETED');

CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_subject" VARCHAR(255) NOT NULL,
    "purpose" "MediaAssetPurpose" NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "original_name" VARCHAR(255) NOT NULL,
    "declared_mime_type" VARCHAR(100) NOT NULL,
    "detected_mime_type" VARCHAR(100),
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" CHAR(64),
    "upload_key" VARCHAR(500),
    "quarantine_key" VARCHAR(500) NOT NULL,
    "object_key" VARCHAR(500),
    "intent_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "upload_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "quarantine_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_assets_upload_key_key" ON "media_assets"("upload_key");
CREATE UNIQUE INDEX "media_assets_quarantine_key_key" ON "media_assets"("quarantine_key");
CREATE UNIQUE INDEX "media_assets_object_key_key" ON "media_assets"("object_key");
CREATE INDEX "media_assets_owner_status_created_idx" ON "media_assets"("owner_subject", "status", "created_at" DESC);
CREATE INDEX "media_assets_status_expiry_idx" ON "media_assets"("status", "upload_expires_at");
CREATE INDEX "media_assets_intent_expiry_idx" ON "media_assets"("status", "intent_expires_at");
