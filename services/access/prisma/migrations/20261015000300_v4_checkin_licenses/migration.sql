CREATE TYPE "CheckInLicenseSource" AS ENUM ('PERSONAL', 'AGENCY');
CREATE TYPE "CheckInLicenseStatus" AS ENUM ('UNASSIGNED', 'ACTIVE', 'REVOKED');
CREATE TABLE "checkin_licenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source" "CheckInLicenseSource" NOT NULL,
  "status" "CheckInLicenseStatus" NOT NULL DEFAULT 'UNASSIGNED',
  "owner_subject" VARCHAR(255) NOT NULL,
  "source_reference" VARCHAR(255) NOT NULL,
  "event_id" UUID,
  "guest_capacity" INTEGER NOT NULL,
  "used_guest_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_at" TIMESTAMPTZ(3),
  CONSTRAINT "checkin_licenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkin_licenses_source_reference_key" UNIQUE ("source_reference"),
  CONSTRAINT "checkin_licenses_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "checkin_licenses_guest_capacity_check" CHECK ("guest_capacity" > 0 AND "used_guest_count" >= 0 AND "used_guest_count" <= "guest_capacity")
);
CREATE INDEX "checkin_licenses_owner_status_idx" ON "checkin_licenses"("owner_subject", "source", "status");
CREATE TABLE "checkin_license_guests" (
  "license_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkin_license_guests_pkey" PRIMARY KEY ("license_id", "token_hash"),
  CONSTRAINT "checkin_license_guests_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "checkin_licenses"("id") ON DELETE CASCADE
);
ALTER TABLE "checkin_links" ADD COLUMN "license_id" UUID;
ALTER TABLE "checkin_links" ADD CONSTRAINT "checkin_links_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "checkin_licenses"("id") ON DELETE RESTRICT;
