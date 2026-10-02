ALTER TABLE "ceremony_program_items" ADD COLUMN "location" VARCHAR(300);
DROP INDEX "ceremony_program_items_ceremony_position_key";
ALTER TABLE "ceremony_program_items" ADD CONSTRAINT "ceremony_program_items_ceremony_position_key"
  UNIQUE ("ceremony_id", "position") DEFERRABLE INITIALLY DEFERRED;
