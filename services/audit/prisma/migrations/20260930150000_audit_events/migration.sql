CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_event_id" VARCHAR(64) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "actor_subject" VARCHAR(255),
  "resource_id" VARCHAR(255),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_source_event_id_key" UNIQUE ("source_event_id")
);
CREATE INDEX "audit_events_received_idx" ON "audit_events"("received_at" DESC, "id" DESC);
CREATE INDEX "audit_events_type_received_idx" ON "audit_events"("event_type", "received_at" DESC);
CREATE INDEX "audit_events_actor_received_idx" ON "audit_events"("actor_subject", "received_at" DESC);

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TYPE "ModerationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');
CREATE TABLE "moderation_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reporter_subject" VARCHAR(255) NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "resource_type" VARCHAR(20) NOT NULL,
  "resource_id" UUID NOT NULL,
  "reason_code" VARCHAR(40) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "status" "ModerationStatus" NOT NULL DEFAULT 'OPEN',
  "reviewed_by" VARCHAR(255),
  "resolution_note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "moderation_reports_reporter_idempotency_key" UNIQUE ("reporter_subject", "idempotency_key"),
  CONSTRAINT "moderation_reports_resource_type_check" CHECK ("resource_type" IN ('EVENT', 'GUEST', 'INVITATION')),
  CONSTRAINT "moderation_reports_reason_code_check" CHECK ("reason_code" IN ('INAPPROPRIATE_CONTENT', 'FRAUD', 'HARASSMENT', 'OTHER'))
);
CREATE INDEX "moderation_reports_status_created_idx" ON "moderation_reports"("status", "created_at" DESC);
CREATE INDEX "moderation_reports_resource_idx" ON "moderation_reports"("resource_type", "resource_id", "created_at" DESC);
