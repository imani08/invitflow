# Profile Service

Owns user-facing profile data in `profile_db`. Keycloak remains the source of identity credentials and status; this service never stores passwords or refresh tokens. Requests require a Keycloak access token with issuer, signature, expiry, audience `profile-api`, authorized party `invitaflow-web`, subject and verified email checks.

## API

- `GET /health/live` — process health
- `GET /health/ready` — database connectivity
- `GET /v1/me` — create the local profile from verified identity claims on first request, then return it
- `PUT /v1/me` — update only `displayName` and/or `locale`

Prisma owns the service-only schema and migrations. Run `pnpm --filter @invitaflow/profile prisma:generate`, then `pnpm --filter @invitaflow/profile prisma:migrate:deploy`. Runtime startup applies committed migrations before listening.
