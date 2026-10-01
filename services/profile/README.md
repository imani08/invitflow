# Profile Service

Owns user-facing profile data in `profile_db`. Keycloak remains the source of identity credentials and status; this service never stores passwords or refresh tokens. Requests require a Keycloak access token with issuer, signature, expiry, audience `profile-api`, authorized party `invitaflow-web`, subject and verified email checks.

## API

- `GET /health/live` — process health
- `GET /health/ready` — database connectivity
- `GET /v1/me` — create the local profile from verified identity claims on first request, then return it
- `PUT /v1/me` — update only `displayName` and/or `locale`
- `GET /v1/me/deletion-request` — inspect the caller's most recent account deletion request
- `POST /v1/me/deletion-request` — create one pending request and append a versioned event to the transactional outbox; repeated requests are idempotent while pending
- `DELETE /v1/me/deletion-request` — cancel the pending request and append a cancellation event

Deletion requests are not deletion execution. No cross-service deletion consumers or legally approved retention policies exist yet; this service never deletes financial records or user data in other databases. RabbitMQ delivery is durable and retried through the outbox. A future orchestrator must coordinate service-owned erasure/anonymization before marking a request `COMPLETED`.

Prisma owns the service-only schema and migrations. Run `pnpm --filter @invitaflow/profile prisma:generate`, then `pnpm --filter @invitaflow/profile prisma:migrate:deploy`. Runtime startup applies committed migrations before listening.
