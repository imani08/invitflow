ALTER TABLE "credit_packs" ADD COLUMN "checkin_events" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "credit_packs" ADD COLUMN "checkin_guest_capacity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_checkin_values" CHECK ("checkin_events" >= 0 AND "checkin_guest_capacity" >= 0);

WITH prior AS (SELECT * FROM "price_schedules" ORDER BY "version" DESC LIMIT 1), next AS (
  INSERT INTO "price_schedules" ("version", "effective_at", "created_by", "change_reason", "tax_policy_enabled", "tax_rule_code", "tax_rate_bps", "idempotency_key")
  SELECT prior."version" + 1, GREATEST(CURRENT_TIMESTAMP, prior."effective_at" + INTERVAL '1 second'), 'system:v4', 'V4 packs: invitations et pointage inclus, contextes séparés', prior."tax_policy_enabled", prior."tax_rule_code", prior."tax_rate_bps", 'seed:v4-checkin-packs'
  FROM prior RETURNING "id"
), inserted AS (
  INSERT INTO "credit_packs" ("schedule_id", "key", "name", "credits", "checkin_events", "checkin_guest_capacity", "price_minor", "currency", "description", "segment", "display_order", "visible")
  SELECT next."id", p."key", p."name", p."credits", p."events", p."capacity", p."price", 'USD', p."description", p."segment", p."position", TRUE
  FROM next CROSS JOIN (VALUES
    ('starter', 'Starter', 50, 1, 50, 1500, 'Invitations finales et pointage partagé pour un événement.', 'INDIVIDUAL', 10),
    ('essentiel', 'Essentiel', 100, 1, 100, 2000, 'Invitations finales et pointage partagé pour un événement.', 'INDIVIDUAL', 20),
    ('event', 'Event', 200, 1, 200, 3000, 'Invitations finales et pointage partagé pour un événement.', 'INDIVIDUAL', 30),
    ('premium', 'Premium', 300, 1, 300, 3500, 'Invitations finales et pointage partagé pour un événement.', 'INDIVIDUAL', 40),
    ('wedding', 'Wedding', 500, 1, 500, 5000, 'Invitations finales et pointage partagé pour un mariage.', 'INDIVIDUAL', 50),
    ('grand-event', 'Grand Event', 1000, 1, 1000, 8000, 'Invitations finales et pointage partagé pour un grand événement.', 'INDIVIDUAL', 60),
    ('agency-starter', 'Agency Starter', 500, 1, 500, 2900, '500 invitations, pointage pour 1 événement client, période de 30 jours.', 'AGENCY', 100),
    ('agency-pro', 'Agency Pro', 1500, 3, 1500, 5900, '1500 invitations, pointage pour 3 événements clients, période de 30 jours.', 'AGENCY', 110),
    ('agency-business', 'Agency Business', 3500, 7, 3500, 9900, '3500 invitations, pointage pour 7 événements clients, période de 30 jours.', 'AGENCY', 120)
  ) AS p("key", "name", "credits", "events", "capacity", "price", "description", "segment", "position")
  RETURNING "schedule_id"
)
INSERT INTO "price_rules" ("schedule_id", "operation", "credit_cost", "unit")
SELECT inserted."schedule_id", prior_rules."operation", prior_rules."credit_cost", prior_rules."unit"
FROM (SELECT DISTINCT "schedule_id" FROM inserted) inserted CROSS JOIN LATERAL (SELECT "operation", "credit_cost", "unit" FROM "price_rules" WHERE "schedule_id" = (SELECT "id" FROM prior)) prior_rules;
