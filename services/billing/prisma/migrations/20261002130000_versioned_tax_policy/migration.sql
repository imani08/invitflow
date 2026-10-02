ALTER TABLE "price_schedules"
  ADD COLUMN "tax_policy_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "tax_rule_code" VARCHAR(80),
  ADD COLUMN "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "price_schedules_tax_policy_consistent" CHECK (
    ("tax_policy_enabled" = FALSE AND "tax_rule_code" IS NULL AND "tax_rate_bps" = 0)
    OR
    ("tax_policy_enabled" = TRUE AND "tax_rule_code" IS NOT NULL AND length(trim("tax_rule_code")) > 0 AND "tax_rate_bps" BETWEEN 1 AND 10000)
  );
