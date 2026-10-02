ALTER TABLE "payment_orders"
  ADD COLUMN "unit_credits" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "unit_price_minor" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "discount_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_rule" VARCHAR(120),
  ADD COLUMN "tax_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "tax_rule" VARCHAR(80),
  ADD COLUMN "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tax_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "subtotal_minor" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "total_minor" INTEGER NOT NULL DEFAULT 1;

UPDATE "payment_orders"
SET "unit_credits" = "credits",
    "quantity" = 1,
    "unit_price_minor" = "amount_minor",
    "discount_minor" = 0,
    "discount_rule" = NULL,
    "tax_enabled" = FALSE,
    "tax_rule" = NULL,
    "tax_rate_bps" = 0,
    "tax_minor" = 0,
    "subtotal_minor" = "amount_minor",
    "total_minor" = "amount_minor";

ALTER TABLE "payment_orders"
  ADD CONSTRAINT "payment_orders_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "payment_orders_unit_credits_positive" CHECK ("unit_credits" > 0),
  ADD CONSTRAINT "payment_orders_unit_price_positive" CHECK ("unit_price_minor" > 0),
  ADD CONSTRAINT "payment_orders_discount_valid" CHECK ("discount_minor" >= 0 AND "discount_minor" <= "unit_price_minor" * "quantity"),
  ADD CONSTRAINT "payment_orders_tax_valid" CHECK (
    "tax_minor" >= 0 AND "tax_rate_bps" BETWEEN 0 AND 10000
    AND (("tax_enabled" = FALSE AND "tax_rule" IS NULL AND "tax_rate_bps" = 0 AND "tax_minor" = 0)
      OR ("tax_enabled" = TRUE AND "tax_rule" IS NOT NULL AND length(trim("tax_rule")) > 0 AND "tax_rate_bps" > 0))
  ),
  ADD CONSTRAINT "payment_orders_subtotal_consistent" CHECK ("subtotal_minor" = "unit_price_minor" * "quantity" - "discount_minor"),
  ADD CONSTRAINT "payment_orders_total_consistent" CHECK ("total_minor" = "subtotal_minor" + "tax_minor" AND "amount_minor" = "total_minor"),
  ADD CONSTRAINT "payment_orders_credits_consistent" CHECK ("credits" = "unit_credits" * "quantity");

CREATE OR REPLACE FUNCTION reject_payment_order_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."owner_subject" IS DISTINCT FROM OLD."owner_subject"
    OR NEW."pack_id" IS DISTINCT FROM OLD."pack_id"
    OR NEW."pack_key" IS DISTINCT FROM OLD."pack_key"
    OR NEW."pack_name" IS DISTINCT FROM OLD."pack_name"
    OR NEW."credits" IS DISTINCT FROM OLD."credits"
    OR NEW."unit_credits" IS DISTINCT FROM OLD."unit_credits"
    OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
    OR NEW."unit_price_minor" IS DISTINCT FROM OLD."unit_price_minor"
    OR NEW."discount_minor" IS DISTINCT FROM OLD."discount_minor"
    OR NEW."discount_rule" IS DISTINCT FROM OLD."discount_rule"
    OR NEW."tax_enabled" IS DISTINCT FROM OLD."tax_enabled"
    OR NEW."tax_rule" IS DISTINCT FROM OLD."tax_rule"
    OR NEW."tax_rate_bps" IS DISTINCT FROM OLD."tax_rate_bps"
    OR NEW."tax_minor" IS DISTINCT FROM OLD."tax_minor"
    OR NEW."subtotal_minor" IS DISTINCT FROM OLD."subtotal_minor"
    OR NEW."total_minor" IS DISTINCT FROM OLD."total_minor"
    OR NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."price_schedule_id" IS DISTINCT FROM OLD."price_schedule_id"
    OR NEW."price_schedule_version" IS DISTINCT FROM OLD."price_schedule_version"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'payment order snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
