CREATE TABLE "ceremony_program_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ceremony_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(1000),
  "starts_at" TIMESTAMPTZ(3),
  "duration_minutes" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ceremony_program_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ceremony_program_items_ceremony_id_fkey" FOREIGN KEY ("ceremony_id") REFERENCES "ceremonies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ceremony_program_items_position_check" CHECK ("position" >= 0),
  CONSTRAINT "ceremony_program_items_duration_check" CHECK ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 1 AND 1440)
);
CREATE UNIQUE INDEX "ceremony_program_items_ceremony_position_key" ON "ceremony_program_items"("ceremony_id", "position");
CREATE INDEX "ceremony_program_items_order_idx" ON "ceremony_program_items"("ceremony_id", "position");
