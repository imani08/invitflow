-- Normalize catalogue entries only. Historical subscription/payment snapshots remain unchanged.
UPDATE "credit_packs"
SET "period_days" = 30
WHERE "segment" = 'AGENCY' AND "period_days" IS DISTINCT FROM 30;

ALTER TABLE "credit_packs"
  ADD CONSTRAINT "credit_packs_agency_period_fixed_30_days_check"
  CHECK ("segment" <> 'AGENCY' OR "period_days" = 30);
