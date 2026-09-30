CREATE TYPE "RsvpStatus" AS ENUM ('ACCEPTED', 'DECLINED');
CREATE TABLE "invitation_rsvps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invitation_id" UUID NOT NULL,
  "ceremony_id" UUID NOT NULL,
  "status" "RsvpStatus" NOT NULL,
  "attending_companions" INTEGER NOT NULL DEFAULT 0,
  "responded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitation_rsvps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitation_rsvps_invitation_ceremony_key" UNIQUE ("invitation_id", "ceremony_id"),
  CONSTRAINT "invitation_rsvps_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitation_rsvps_nonnegative_companions" CHECK ("attending_companions" >= 0)
);
CREATE TABLE "invitation_check_ins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invitation_id" UUID NOT NULL,
  "ceremony_id" UUID NOT NULL,
  "checked_by" VARCHAR(255) NOT NULL,
  "companion_count" INTEGER NOT NULL DEFAULT 0,
  "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitation_check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitation_check_ins_invitation_ceremony_key" UNIQUE ("invitation_id", "ceremony_id"),
  CONSTRAINT "invitation_check_ins_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitation_check_ins_nonnegative_companions" CHECK ("companion_count" >= 0)
);
CREATE INDEX "invitation_check_ins_ceremony_checked_idx" ON "invitation_check_ins"("ceremony_id", "checked_at" DESC);
