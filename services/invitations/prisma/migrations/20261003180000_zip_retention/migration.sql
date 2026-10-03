ALTER TABLE "invitation_batches"
  ADD COLUMN "zip_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "zip_deleted_at" TIMESTAMPTZ(3);
CREATE INDEX "invitation_batches_zip_expiry_idx"
  ON "invitation_batches"("zip_expires_at") WHERE "zip_expires_at" IS NOT NULL AND "zip_deleted_at" IS NULL;
