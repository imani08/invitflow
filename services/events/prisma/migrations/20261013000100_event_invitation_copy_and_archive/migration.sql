-- Additive P0 migration: invitations carry their own editable copy and an
-- event may be archived only through an explicit lifecycle action.
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "couple_names" VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "invitation_text" VARCHAR(12000);
