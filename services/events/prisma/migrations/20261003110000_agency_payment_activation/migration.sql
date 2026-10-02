ALTER TYPE "AgencySubscriptionStatus" ADD VALUE 'PAST_DUE';
ALTER TABLE "agency_subscriptions"
  ADD COLUMN "payment_order_id" UUID,
  ADD COLUMN "payment_id" UUID,
  ADD COLUMN "billing_period_start" TIMESTAMPTZ(3),
  ADD COLUMN "billing_period_end" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "agency_subscriptions_payment_order_id_key" ON "agency_subscriptions"("payment_order_id");
CREATE UNIQUE INDEX "agency_subscriptions_payment_id_key" ON "agency_subscriptions"("payment_id");
ALTER TABLE "agency_subscriptions"
  ADD CONSTRAINT "agency_subscriptions_period_window_check" CHECK ("billing_period_end" IS NULL OR "billing_period_start" IS NULL OR "billing_period_end" > "billing_period_start");
