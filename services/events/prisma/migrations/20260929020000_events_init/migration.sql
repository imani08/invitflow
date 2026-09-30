CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "CeremonyStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "events" (
  "id" UUID NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(4000),
  "event_type" VARCHAR(40) NOT NULL,
  "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "start_at" TIMESTAMPTZ(3),
  "end_at" TIMESTAMPTZ(3),
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Kinshasa',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "events_owner_created_idx" ON "events"("owner_subject", "created_at" DESC);

CREATE TABLE "ceremonies" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "ceremony_type" VARCHAR(40) NOT NULL,
  "description" VARCHAR(2000),
  "location" VARCHAR(300),
  "address" VARCHAR(500),
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "instructions" VARCHAR(4000),
  "dress_code" VARCHAR(200),
  "notes" VARCHAR(2000),
  "capacity" INTEGER,
  "start_at" TIMESTAMPTZ(3) NOT NULL,
  "end_at" TIMESTAMPTZ(3),
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Kinshasa',
  "status" "CeremonyStatus" NOT NULL DEFAULT 'SCHEDULED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ceremonies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ceremonies_id_event_id_key" UNIQUE ("id", "event_id"),
  CONSTRAINT "ceremonies_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ceremonies_event_start_idx" ON "ceremonies"("event_id", "start_at");

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
CREATE INDEX "outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");
