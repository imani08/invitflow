# Billing service

Phase 7 owner of `billing_db`, versioned credit-pack pricing and operation rules. The first migration persists the specification's initial indicative USD prices (Mini 50/$4, Event 150/$9, Pro 300/$15, Wedding 500/$22, Large 1,000/$38), and the base rule that one final personalized invitation costs one credit. Preview and test rules cost zero credits. Pack prices are stored as integer minor currency units.

Price schedules, packs and rules are immutable at the database level. Finance admins can append a schedule through `POST /v1/admin/price-schedules` or the authenticated web screen at `/admin/pricing`; every schedule has a monotonically increasing version and a future UTC effective time. Quotes return the schedule ID and version for a future order snapshot. Removing a pack from a new schedule makes it unavailable when that schedule becomes effective.

All HTTP routes require a Keycloak token with the `billing-api` audience:

- `GET /v1/pricing` returns the active persisted catalog and operation rules.
- `POST /v1/quotes` with `{ "operation": "invitation.final.personalized", "quantity": 10 }` returns a versioned credit quote.
- `POST /v1/admin/price-schedules` accepts `{ "effectiveAt": "...Z", "packs": [...], "rules": [...] }`; caller must have `FINANCE_ADMIN` or `SUPER_ADMIN` and an `Idempotency-Key`.

This phase does not capture money, create orders or issue invoices. Payment-provider checkout, verified payment credits, refunds and purchase history belong to Phase 8 — Payments and later Billing work.
