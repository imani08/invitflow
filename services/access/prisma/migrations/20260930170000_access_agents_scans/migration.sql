CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "AccessScanOutcome" AS ENUM ('ACCEPTED', 'DUPLICATE', 'REJECTED', 'UNAVAILABLE');

CREATE TABLE "checkin_agents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "agent_subject" VARCHAR(255) NOT NULL,
  "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "checkin_agents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checkin_agents_event_subject_key" ON "checkin_agents"("event_id", "agent_subject");
CREATE INDEX "checkin_agents_owner_event_status_idx" ON "checkin_agents"("owner_subject", "event_id", "status");

CREATE TABLE "agent_ceremony_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "ceremony_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_ceremony_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_ceremony_grants_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "checkin_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_ceremony_grants_agent_ceremony_key" ON "agent_ceremony_grants"("agent_id", "ceremony_id");
CREATE INDEX "agent_ceremony_grants_owner_event_ceremony_idx" ON "agent_ceremony_grants"("owner_subject", "event_id", "ceremony_id");

CREATE TABLE "access_scan_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "ceremony_id" UUID NOT NULL,
  "operator_subject" VARCHAR(255) NOT NULL,
  "agent_id" UUID,
  "device_fingerprint" CHAR(64),
  "user_agent" VARCHAR(300),
  "outcome" "AccessScanOutcome" NOT NULL,
  "upstream_status" SMALLINT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "access_scan_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "access_scan_attempts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "checkin_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "access_scan_attempts_owner_event_ceremony_created_idx" ON "access_scan_attempts"("owner_subject", "event_id", "ceremony_id", "created_at" DESC);
CREATE INDEX "access_scan_attempts_agent_created_idx" ON "access_scan_attempts"("agent_id", "created_at" DESC);

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "access_outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "access_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");
