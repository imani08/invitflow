CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "source_event_id" VARCHAR(64) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(3),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_source_event_id_key" UNIQUE ("source_event_id")
);
CREATE INDEX "notifications_owner_created_idx" ON "notifications"("owner_subject", "created_at" DESC, "id" DESC);
CREATE INDEX "notifications_owner_unread_idx" ON "notifications"("owner_subject", "read_at", "created_at" DESC);

CREATE TABLE "notification_preferences" (
  "owner_subject" VARCHAR(255) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("owner_subject")
);
