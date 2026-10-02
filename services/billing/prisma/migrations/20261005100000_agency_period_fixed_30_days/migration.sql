-- Preserve historical published catalogue rows.
-- Existing Agency rows may remain unchanged because published pricing is immutable.
-- The constraint is enforced for all new or modified rows.

ALTER TABLE "credit_packs"
  ADD CONSTRAINT "credit_packs_agency_period_fixed_30_days_check"
  CHECK ("segment" <> 'AGENCY' OR "period_days" = 30)
  NOT VALID;
