DO $$
DECLARE
  prior RECORD;
  next_id UUID;
BEGIN
  SELECT * INTO STRICT prior FROM price_schedules ORDER BY version DESC LIMIT 1;
  INSERT INTO price_schedules (version, effective_at, created_by, change_reason, tax_policy_enabled, tax_rule_code, tax_rate_bps, idempotency_key)
  VALUES (prior.version + 1, GREATEST(CURRENT_TIMESTAMP, prior.effective_at + INTERVAL '1 second'), 'system:agency-plan-seed', 'Initial agency plan catalog; editable only by publishing a new immutable schedule', prior.tax_policy_enabled, prior.tax_rule_code, prior.tax_rate_bps, 'seed:agency-plans-v1')
  RETURNING id INTO next_id;

  INSERT INTO credit_packs (schedule_id, key, name, credits, price_minor, currency, description, segment, display_order, visible)
  SELECT next_id, key, name, credits, price_minor, currency, description, segment, display_order, visible
  FROM credit_packs WHERE schedule_id = prior.id;

  INSERT INTO credit_packs (schedule_id, key, name, credits, price_minor, currency, description, segment, display_order, visible)
  VALUES
    (next_id, 'agency-starter', 'Agency Starter', 500, 2900, 'USD', 'Agency plan · initial configurable catalog seed', 'AGENCY', 100, TRUE),
    (next_id, 'agency-pro', 'Agency Pro', 1500, 5900, 'USD', 'Agency plan · initial configurable catalog seed', 'AGENCY', 110, TRUE),
    (next_id, 'agency-business', 'Agency Business', 3500, 9900, 'USD', 'Agency plan · initial configurable catalog seed', 'AGENCY', 120, TRUE);

  INSERT INTO price_rules (schedule_id, operation, credit_cost, unit)
  SELECT next_id, operation, credit_cost, unit FROM price_rules WHERE schedule_id = prior.id;
END $$;
