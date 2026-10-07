ALTER TABLE "payment_orders"
  ADD COLUMN "sales_terms_version" VARCHAR(20),
  ADD COLUMN "refund_policy_version" VARCHAR(20),
  ADD COLUMN "sales_terms_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN "refund_policy_accepted_at" TIMESTAMPTZ(3);
