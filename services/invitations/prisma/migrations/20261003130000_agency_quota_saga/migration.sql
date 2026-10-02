ALTER TABLE "invitation_batches"
  ADD COLUMN "agency_reservation_reference" VARCHAR(255),
  ADD COLUMN "agency_reserved_credits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "wallet_reserved_credits" INTEGER NOT NULL DEFAULT 0;
UPDATE "invitation_batches" SET "wallet_reserved_credits" = "total_items";
CREATE UNIQUE INDEX "invitation_batches_agency_reservation_reference_key" ON "invitation_batches"("agency_reservation_reference");
ALTER TABLE "invitation_batches"
  ADD CONSTRAINT "invitation_batches_quota_allocations_nonnegative" CHECK ("agency_reserved_credits" >= 0 AND "wallet_reserved_credits" >= 0 AND "agency_reserved_credits" + "wallet_reserved_credits" = "total_items");
ALTER TABLE "invitation_batches" ADD COLUMN "agency_workspace_id" UUID;
