# Analytics Service

Owns aggregate projections in `analytics_db`; it consumes versioned business events and never queries or copies another service's production database. Raw event payloads are not persisted. The processed-event table retains event identifiers and types for idempotency.

## Current metrics

- Events created
- Invitations generated and failed batches
- Rendered cards, render failures and AI job totals/completions/failures
- RSVP responses and check-ins
- Successful and failed payments, refunds and revenue by ISO currency
- Credits sold and credits consumed

Daily values use UTC calendar dates. Monetary values are stored as integer minor units and returned as decimal strings. `GET /v1/admin/analytics/daily` requires a fresh, verified Keycloak token with the `admin-api` audience and either `FINANCE_ADMIN` or `SUPER_ADMIN`; it returns at most 90 days.

RabbitMQ routes the shared event topic to `analytics.events`, with retry and dead-letter queues. Projection updates and event-id deduplication commit in one database transaction. The current management-API polling consumer acknowledges when it fetches; a process crash between fetch and commit can lose an analytics event. Replace this with a client that supports post-commit acknowledgement before treating the projection as complete for production reporting. Rebuild/backfill tooling and retention for processed event identifiers are also outstanding.

The projection is not a financial ledger. Payments and Wallet remain authoritative for money and credit balances. Validate the migration, queue behavior, Keycloak audience, permissions and recovery against a running Compose environment before relying on the dashboard.
