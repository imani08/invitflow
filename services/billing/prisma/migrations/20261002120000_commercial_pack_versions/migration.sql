ALTER TABLE "price_schedules"
  ADD COLUMN "change_reason" VARCHAR(500) NOT NULL DEFAULT 'Migration historique';

ALTER TABLE "credit_packs"
  ADD COLUMN "description" VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN "segment" VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "badge" VARCHAR(40),
  ADD COLUMN "valid_from" TIMESTAMPTZ(3),
  ADD COLUMN "valid_until" TIMESTAMPTZ(3),
  ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD CONSTRAINT "credit_packs_valid_window" CHECK ("valid_until" IS NULL OR "valid_from" IS NULL OR "valid_until" > "valid_from"),
  ADD CONSTRAINT "credit_packs_display_order_nonnegative" CHECK ("display_order" >= 0),
  ADD CONSTRAINT "credit_packs_segment_valid" CHECK ("segment" IN ('INDIVIDUAL', 'AGENCY', 'ALL'));

-- The complementary specification supersedes the original commercial seed.
-- Publish it as a new immutable schedule; existing orders and schedule v1 remain unchanged.
WITH schedule AS (
  INSERT INTO "price_schedules" ("version", "effective_at", "created_by", "change_reason", "idempotency_key")
  VALUES (
    (SELECT COALESCE(MAX("version"), 0) + 1 FROM "price_schedules"),
    CURRENT_TIMESTAMP,
    'system:complementary-spec-v1',
    'Grille initiale configurable issue du cahier des charges complémentaire v1.0',
    'seed:complementary-spec-v1'
  )
  RETURNING "id", "version", "effective_at", "created_by", "change_reason"
)
INSERT INTO "credit_packs" (
  "schedule_id", "key", "name", "credits", "price_minor", "currency",
  "description", "segment", "display_order", "badge", "visible"
)
SELECT schedule."id", pack."key", pack."name", pack."credits", pack."price_minor", 'USD',
       pack."description", 'INDIVIDUAL', pack."display_order", NULL, TRUE
FROM schedule CROSS JOIN (VALUES
  ('starter', 'Starter', 50, 1500, '50 invitations personnalisées', 10),
  ('essential', 'Essentiel', 100, 2000, '100 invitations personnalisées', 20),
  ('event', 'Event', 200, 3000, '200 invitations personnalisées', 30),
  ('premium', 'Premium', 300, 3500, '300 invitations personnalisées', 40),
  ('wedding', 'Wedding', 500, 5000, '500 invitations personnalisées', 50),
  ('grand-event', 'Grand Event', 1000, 8000, '1 000 invitations personnalisées', 60)
) AS pack("key", "name", "credits", "price_minor", "description", "display_order");

INSERT INTO "price_rules" ("schedule_id", "operation", "credit_cost", "unit")
SELECT "id", 'invitation.final.personalized', 1, 'invitation'
FROM "price_schedules" WHERE "idempotency_key" = 'seed:complementary-spec-v1';
INSERT INTO "price_rules" ("schedule_id", "operation", "credit_cost", "unit")
SELECT schedule."id", operation."key", 0, 'preview'
FROM "price_schedules" schedule
CROSS JOIN (VALUES ('invitation.preview'), ('invitation.test')) AS operation("key")
WHERE schedule."idempotency_key" = 'seed:complementary-spec-v1';

INSERT INTO "outbox_messages" ("event_type", "aggregate_id", "payload")
SELECT 'billing.price-schedule-published.v1', schedule."id",
       jsonb_build_object('scheduleId', schedule."id", 'version', schedule."version", 'effectiveAt', schedule."effective_at", 'createdBy', schedule."created_by", 'changeReason', schedule."change_reason")
FROM "price_schedules" schedule
WHERE schedule."idempotency_key" = 'seed:complementary-spec-v1';
