CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'CANCELLED', 'COMPLETED');

CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL,
    "identity_subject" VARCHAR(255) NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_deletion_requests_subject_requested_idx"
ON "account_deletion_requests"("identity_subject", "requested_at" DESC);

CREATE UNIQUE INDEX "account_deletion_requests_one_pending_per_subject_key"
ON "account_deletion_requests"("identity_subject") WHERE "status" = 'PENDING';

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

CREATE INDEX "profile_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");
