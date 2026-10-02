ALTER TABLE "credit_packs"
  ADD COLUMN "period_days" INTEGER;

ALTER TABLE "credit_packs"
  ADD CONSTRAINT "credit_packs_period_days_positive_check"
  CHECK ("period_days" IS NULL OR "period_days" > 0);
