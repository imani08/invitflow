CREATE TYPE "PaymentOrderType" AS ENUM ('CREDIT_PURCHASE', 'AGENCY_SUBSCRIPTION');

-- Every historical order was created by the credit-pack checkout path and owns a wallet credit grant.
ALTER TABLE "payment_orders"
  ADD COLUMN "order_type" "PaymentOrderType" NOT NULL DEFAULT 'CREDIT_PURCHASE',
  ADD COLUMN "business_reference" VARCHAR(255),
  ADD COLUMN "metadata" JSONB;

CREATE OR REPLACE FUNCTION reject_payment_order_type_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."order_type" IS DISTINCT FROM OLD."order_type"
    OR NEW."business_reference" IS DISTINCT FROM OLD."business_reference"
    OR NEW."metadata" IS DISTINCT FROM OLD."metadata" THEN
    RAISE EXCEPTION 'payment order type and business reference snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_order_type_immutable
BEFORE UPDATE ON "payment_orders"
FOR EACH ROW EXECUTE FUNCTION reject_payment_order_type_mutation();
