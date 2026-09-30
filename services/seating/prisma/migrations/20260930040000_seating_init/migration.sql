CREATE TYPE "SeatingMode" AS ENUM ('NO_SEATING', 'TABLE', 'ZONE');
CREATE TYPE "SeatingImportStatus" AS ENUM ('ANALYZED', 'COMPLETED');

CREATE TABLE "seating_plans" (
    "id" UUID NOT NULL,
    "owner_subject" VARCHAR(255) NOT NULL,
    "event_id" UUID NOT NULL,
    "ceremony_id" UUID NOT NULL,
    "mode" "SeatingMode" NOT NULL DEFAULT 'NO_SEATING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "seating_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seating_plans_ceremony_id_key" ON "seating_plans"("ceremony_id");
CREATE INDEX "seating_plans_owner_event_idx" ON "seating_plans"("owner_subject", "event_id");

CREATE TABLE "seating_tables" (
    "id" UUID NOT NULL,
    "owner_subject" VARCHAR(255) NOT NULL,
    "event_id" UUID NOT NULL,
    "ceremony_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "number" INTEGER,
    "capacity" SMALLINT NOT NULL,
    "category" VARCHAR(80),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "seating_tables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seating_tables_capacity_check" CHECK ("capacity" BETWEEN 1 AND 500),
    CONSTRAINT "seating_tables_number_check" CHECK ("number" IS NULL OR "number" BETWEEN 1 AND 10000),
    CONSTRAINT "seating_tables_plan_fkey" FOREIGN KEY ("ceremony_id") REFERENCES "seating_plans"("ceremony_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "seating_tables_ceremony_name_key" ON "seating_tables"("ceremony_id", "name");
CREATE UNIQUE INDEX "seating_tables_ceremony_number_key" ON "seating_tables"("ceremony_id", "number");
CREATE INDEX "seating_tables_owner_event_ceremony_idx" ON "seating_tables"("owner_subject", "event_id", "ceremony_id");

CREATE TABLE "seating_zones" (
    "id" UUID NOT NULL,
    "owner_subject" VARCHAR(255) NOT NULL,
    "event_id" UUID NOT NULL,
    "ceremony_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "capacity" SMALLINT,
    "category" VARCHAR(80),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "seating_zones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seating_zones_capacity_check" CHECK ("capacity" IS NULL OR "capacity" BETWEEN 1 AND 500),
    CONSTRAINT "seating_zones_plan_fkey" FOREIGN KEY ("ceremony_id") REFERENCES "seating_plans"("ceremony_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "seating_zones_ceremony_name_key" ON "seating_zones"("ceremony_id", "name");
CREATE INDEX "seating_zones_owner_event_ceremony_idx" ON "seating_zones"("owner_subject", "event_id", "ceremony_id");

CREATE TABLE "seating_assignments" (
    "id" UUID NOT NULL,
    "owner_subject" VARCHAR(255) NOT NULL,
    "event_id" UUID NOT NULL,
    "ceremony_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "table_id" UUID,
    "zone_id" UUID,
    "seats_reserved" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "seating_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seating_assignments_target_check" CHECK (("table_id" IS NOT NULL AND "zone_id" IS NULL) OR ("table_id" IS NULL AND "zone_id" IS NOT NULL)),
    CONSTRAINT "seating_assignments_seats_check" CHECK ("seats_reserved" BETWEEN 1 AND 21),
    CONSTRAINT "seating_assignments_plan_fkey" FOREIGN KEY ("ceremony_id") REFERENCES "seating_plans"("ceremony_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "seating_assignments_table_fkey" FOREIGN KEY ("table_id") REFERENCES "seating_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "seating_assignments_zone_fkey" FOREIGN KEY ("zone_id") REFERENCES "seating_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "seating_assignments_ceremony_guest_key" ON "seating_assignments"("ceremony_id", "guest_id");
CREATE INDEX "seating_assignments_owner_event_ceremony_idx" ON "seating_assignments"("owner_subject", "event_id", "ceremony_id");
CREATE INDEX "seating_assignments_table_idx" ON "seating_assignments"("table_id");
CREATE INDEX "seating_assignments_zone_idx" ON "seating_assignments"("zone_id");

CREATE TABLE "seating_import_jobs" (
    "id" UUID NOT NULL,
    "owner_subject" VARCHAR(255) NOT NULL,
    "event_id" UUID NOT NULL,
    "ceremony_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "status" "SeatingImportStatus" NOT NULL DEFAULT 'ANALYZED',
    "source_rows" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "result_summary" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "seating_import_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "seating_import_owner_ceremony_created_idx" ON "seating_import_jobs"("owner_subject", "event_id", "ceremony_id", "created_at" DESC);

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
CREATE INDEX "seating_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");
