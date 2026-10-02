CREATE TYPE "AgencyRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "AgencyMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "AgencyWorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "AgencySubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "AgencyQuotaReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

ALTER TABLE "events" ADD COLUMN "agency_workspace_id" UUID;
CREATE UNIQUE INDEX "events_id_agency_workspace_key" ON "events"("id", "agency_workspace_id");

CREATE TABLE "agency_workspaces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(120) NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL, "status" "AgencyWorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "agency_workspaces_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agency_workspaces_owner_created_idx" ON "agency_workspaces"("owner_subject", "created_at" DESC);

CREATE TABLE "agency_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "subject" VARCHAR(255) NOT NULL,
  "role" "AgencyRole" NOT NULL DEFAULT 'MEMBER', "status" "AgencyMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "added_by" VARCHAR(255) NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "agency_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agency_memberships_owner_role_check" CHECK ("role" <> 'OWNER' OR "subject" = "added_by")
);
CREATE UNIQUE INDEX "agency_memberships_workspace_subject_key" ON "agency_memberships"("workspace_id", "subject");
CREATE INDEX "agency_memberships_subject_status_idx" ON "agency_memberships"("subject", "status");

CREATE TABLE "agency_clients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(320), "phone" VARCHAR(40), "created_by" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "agency_clients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_clients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agency_clients_id_workspace_key" ON "agency_clients"("id", "workspace_id");
CREATE INDEX "agency_clients_workspace_created_idx" ON "agency_clients"("workspace_id", "created_at" DESC);

CREATE TABLE "agency_client_events" (
  "workspace_id" UUID NOT NULL, "client_id" UUID NOT NULL, "event_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_client_events_pkey" PRIMARY KEY ("workspace_id", "client_id", "event_id"),
  CONSTRAINT "agency_client_events_client_workspace_fkey" FOREIGN KEY ("client_id", "workspace_id") REFERENCES "agency_clients"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agency_client_events_event_workspace_fkey" FOREIGN KEY ("event_id", "workspace_id") REFERENCES "events"("id", "agency_workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "agency_client_events_event_idx" ON "agency_client_events"("workspace_id", "event_id");

CREATE TABLE "agency_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "plan_pack_id" UUID NOT NULL,
  "plan_key" VARCHAR(60) NOT NULL, "plan_name" VARCHAR(100) NOT NULL, "quota_credits" INTEGER NOT NULL,
  "price_minor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL, "price_schedule_id" UUID NOT NULL,
  "price_schedule_version" INTEGER NOT NULL, "status" "AgencySubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "starts_at" TIMESTAMPTZ(3), "ends_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agency_subscriptions_positive_values_check" CHECK ("quota_credits" > 0 AND "price_minor" > 0 AND "price_schedule_version" > 0),
  CONSTRAINT "agency_subscriptions_window_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at")
);
CREATE INDEX "agency_subscriptions_workspace_created_idx" ON "agency_subscriptions"("workspace_id", "created_at" DESC);

CREATE TABLE "agency_quota_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "event_id" UUID NOT NULL,
  "reference_key" VARCHAR(255) NOT NULL, "credits" INTEGER NOT NULL, "status" "AgencyQuotaReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "agency_quota_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_quota_reservations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agency_quota_reservations_event_workspace_fkey" FOREIGN KEY ("event_id", "workspace_id") REFERENCES "events"("id", "agency_workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agency_quota_reservations_credits_check" CHECK ("credits" > 0)
);
CREATE UNIQUE INDEX "agency_quota_reservations_reference_key_key" ON "agency_quota_reservations"("reference_key");
CREATE INDEX "agency_quota_reservations_usage_idx" ON "agency_quota_reservations"("workspace_id", "status");
