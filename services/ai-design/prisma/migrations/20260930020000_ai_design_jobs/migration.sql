CREATE TYPE "AiDesignJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'PROPOSED', 'FAILED', 'CANCELLED');

CREATE TABLE "ai_design_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "design_id" UUID NOT NULL,
  "base_version" INTEGER NOT NULL,
  "prompt" VARCHAR(2000) NOT NULL,
  "source_document" JSONB NOT NULL,
  "proposal" JSONB,
  "preview_object_key" VARCHAR(500),
  "summary" VARCHAR(1000),
  "provider" VARCHAR(60),
  "status" "AiDesignJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "delivery_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_design_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_design_jobs_owner_design_created_idx" ON "ai_design_jobs"("owner_subject", "event_id", "design_id", "created_at" DESC);
CREATE INDEX "ai_design_jobs_delivery_idx" ON "ai_design_jobs"("status", "delivery_after");

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_design_outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_design_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");
