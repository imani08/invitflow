ALTER TABLE "invitation_batch_items"
  ADD COLUMN "size_bytes" BIGINT;
ALTER TABLE "invitation_batches"
  ADD COLUMN "zip_size_bytes" BIGINT,
  ADD COLUMN "zip_cleanup_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "zip_cleanup_last_error" VARCHAR(80);
CREATE INDEX "invitation_batches_storage_event_idx"
  ON "invitation_batches"("event_id", "agency_workspace_id");
