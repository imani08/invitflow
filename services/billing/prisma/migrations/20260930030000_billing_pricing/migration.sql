CREATE TABLE "price_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" INTEGER NOT NULL,
  "effective_at" TIMESTAMPTZ(3) NOT NULL,
  "created_by" VARCHAR(255) NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_schedules_version_key" UNIQUE ("version"),
  CONSTRAINT "price_schedules_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "price_schedules_positive_version" CHECK ("version" > 0)
);
CREATE INDEX "billing_price_schedules_effective_idx" ON "price_schedules"("effective_at" DESC);

CREATE TABLE "credit_packs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL,
  "key" VARCHAR(60) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "credits" INTEGER NOT NULL,
  "price_minor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_credit_packs_schedule_key" UNIQUE ("schedule_id", "key"),
  CONSTRAINT "credit_packs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "price_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "credit_packs_positive_values" CHECK ("credits" > 0 AND "price_minor" > 0)
);
CREATE INDEX "billing_credit_packs_catalog_idx" ON "credit_packs"("schedule_id", "credits");

CREATE TABLE "price_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL,
  "operation" VARCHAR(120) NOT NULL,
  "credit_cost" INTEGER NOT NULL,
  "unit" VARCHAR(60) NOT NULL,
  CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_price_rules_schedule_operation_key" UNIQUE ("schedule_id", "operation"),
  CONSTRAINT "price_rules_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "price_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "price_rules_nonnegative_cost" CHECK ("credit_cost" >= 0)
);

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "billing_outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "billing_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");

CREATE FUNCTION reject_billing_price_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'published price records are immutable; create a new schedule';
END;
$$;
CREATE TRIGGER "price_schedules_immutable" BEFORE UPDATE OR DELETE ON "price_schedules" FOR EACH ROW EXECUTE FUNCTION reject_billing_price_mutation();
CREATE TRIGGER "credit_packs_immutable" BEFORE UPDATE OR DELETE ON "credit_packs" FOR EACH ROW EXECUTE FUNCTION reject_billing_price_mutation();
CREATE TRIGGER "price_rules_immutable" BEFORE UPDATE OR DELETE ON "price_rules" FOR EACH ROW EXECUTE FUNCTION reject_billing_price_mutation();

-- Commercial reference prices from the specification; future changes append a new immutable version.
WITH schedule AS (
  INSERT INTO "price_schedules" ("version", "effective_at", "created_by", "idempotency_key")
  VALUES (1, TIMESTAMPTZ '1970-01-01 00:00:00+00', 'system:phase-7-seed', 'seed:phase-7-v1')
  RETURNING "id"
)
INSERT INTO "credit_packs" ("schedule_id", "key", "name", "credits", "price_minor", "currency")
SELECT schedule."id", pack."key", pack."name", pack."credits", pack."price_minor", 'USD'
FROM schedule CROSS JOIN (VALUES
  ('mini', 'Mini', 50, 400),
  ('event', 'Event', 150, 900),
  ('pro', 'Pro', 300, 1500),
  ('wedding', 'Wedding', 500, 2200),
  ('large', 'Large', 1000, 3800)
) AS pack("key", "name", "credits", "price_minor");

INSERT INTO "price_rules" ("schedule_id", "operation", "credit_cost", "unit")
SELECT "id", 'invitation.final.personalized', 1, 'invitation'
FROM "price_schedules" WHERE "version" = 1;
INSERT INTO "price_rules" ("schedule_id", "operation", "credit_cost", "unit")
SELECT "id", operation."key", 0, 'preview'
FROM "price_schedules" CROSS JOIN (VALUES ('invitation.preview'), ('invitation.test')) AS operation("key")
WHERE "version" = 1;
