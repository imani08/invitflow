CREATE TYPE "GuestStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ImportStatus" AS ENUM ('ANALYZED', 'MAPPED', 'COMPLETED', 'FAILED');

CREATE TABLE "guest_groups" (
  "id" UUID NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_groups_event_name_key" UNIQUE ("event_id", "name")
);
CREATE INDEX "guest_groups_owner_event_idx" ON "guest_groups"("owner_subject", "event_id");

CREATE TABLE "guests" (
  "id" UUID NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "group_id" UUID,
  "full_name" VARCHAR(160) NOT NULL,
  "email" VARCHAR(320),
  "phone" VARCHAR(40),
  "notes" VARCHAR(2000),
  "status" "GuestStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "guests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "guest_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "guests_owner_event_created_idx" ON "guests"("owner_subject", "event_id", "created_at" DESC, "id" DESC);
CREATE UNIQUE INDEX "guests_event_email_key" ON "guests"("event_id", "email");

CREATE TABLE "guest_ceremony_access" (
  "id" UUID NOT NULL,
  "guest_id" UUID NOT NULL,
  "ceremony_id" UUID NOT NULL,
  "is_invited" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowed_companions" INTEGER NOT NULL DEFAULT 0,
  "table_reference" VARCHAR(120),
  "zone_reference" VARCHAR(120),
  "seat_number" VARCHAR(40),
  "category" VARCHAR(80),
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "guest_ceremony_access_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_ceremony_access_guest_ceremony_key" UNIQUE ("guest_id", "ceremony_id"),
  CONSTRAINT "guest_ceremony_access_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "guest_ceremony_access_ceremony_idx" ON "guest_ceremony_access"("ceremony_id", "guest_id");

CREATE TABLE "companions" (
  "id" UUID NOT NULL,
  "guest_id" UUID NOT NULL,
  "full_name" VARCHAR(160) NOT NULL,
  "relationship" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "companions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "companions_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "companions_guest_idx" ON "companions"("guest_id");

CREATE TABLE "import_jobs" (
  "id" UUID NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "file_type" VARCHAR(10) NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'ANALYZED',
  "columns" JSONB NOT NULL,
  "source_rows" JSONB NOT NULL,
  "mapping" JSONB,
  "ceremony_ids" JSONB,
  "preview" JSONB,
  "result_summary" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "import_jobs_owner_event_created_idx" ON "import_jobs"("owner_subject", "event_id", "created_at" DESC);

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
CREATE INDEX "guest_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");

ALTER TABLE "guest_ceremony_access" ADD CONSTRAINT "guest_access_companions_nonnegative" CHECK ("allowed_companions" >= 0);
ALTER TABLE "guest_ceremony_access" ADD CONSTRAINT "guest_access_not_self_seated" CHECK ("is_invited" OR "allowed_companions" = 0);
