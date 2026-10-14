CREATE TYPE "CheckInLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "checkin_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "event_name" VARCHAR(120) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "label" VARCHAR(120),
  "reference" VARCHAR(140) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "status" "CheckInLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "checkin_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checkin_links_token_hash_key" ON "checkin_links"("token_hash");
CREATE INDEX "checkin_links_owner_event_status_created_idx" ON "checkin_links"("owner_subject", "event_id", "status", "created_at" DESC);

CREATE TABLE "checkin_link_ceremony_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "link_id" UUID NOT NULL,
  "ceremony_id" UUID NOT NULL,
  "ceremony_name" VARCHAR(120) NOT NULL,
  "start_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkin_link_ceremony_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkin_link_ceremony_grants_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "checkin_links"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "checkin_link_ceremony_grants_link_ceremony_key" ON "checkin_link_ceremony_grants"("link_id", "ceremony_id");
CREATE INDEX "checkin_link_ceremony_grants_ceremony_expiry_idx" ON "checkin_link_ceremony_grants"("ceremony_id", "expires_at");

ALTER TABLE "access_scan_attempts" ADD COLUMN "link_id" UUID;
ALTER TABLE "access_scan_attempts" ADD CONSTRAINT "access_scan_attempts_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "checkin_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "access_scan_attempts_link_created_idx" ON "access_scan_attempts"("link_id", "created_at" DESC);
