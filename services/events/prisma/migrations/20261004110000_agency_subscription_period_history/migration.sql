ALTER TABLE "agency_subscriptions"
  ADD COLUMN "current_plan_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "period_days" INTEGER,
  ADD COLUMN "renewal_of_id" UUID;

ALTER TABLE "agency_subscriptions"
  ADD CONSTRAINT "agency_subscriptions_period_days_positive_check"
  CHECK ("period_days" IS NULL OR "period_days" > 0),
  ADD CONSTRAINT "agency_subscriptions_renewal_not_self_check"
  CHECK ("renewal_of_id" IS NULL OR "renewal_of_id" <> "id"),
  ADD CONSTRAINT "agency_subscriptions_renewal_of_id_fkey"
  FOREIGN KEY ("renewal_of_id") REFERENCES "agency_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy ACTIVE rows have no known end date; do not silently grant an infinite period.
UPDATE "agency_subscriptions" SET "status" = 'PAST_DUE' WHERE "status" = 'ACTIVE' AND "billing_period_end" IS NULL;

CREATE INDEX "agency_subscriptions_renewal_of_id_idx" ON "agency_subscriptions"("renewal_of_id");
CREATE INDEX "agency_subscriptions_period_window_idx" ON "agency_subscriptions"("workspace_id", "status", "billing_period_start", "billing_period_end");
