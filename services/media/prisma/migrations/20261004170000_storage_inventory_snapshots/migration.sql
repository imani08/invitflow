CREATE TABLE "storage_inventory_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "status" VARCHAR(24) NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "measured_at" TIMESTAMPTZ(3),
  "valid_until" TIMESTAMPTZ(3),
  "total_bytes" BIGINT,
  "object_count" BIGINT,
  "summary" JSONB,
  "error_code" VARCHAR(80),
  CONSTRAINT "storage_inventory_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "storage_inventory_snapshots_started_at_idx" ON "storage_inventory_snapshots"("started_at" DESC);