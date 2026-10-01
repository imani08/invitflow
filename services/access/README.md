# Access Service

Access owns event check-in agent assignments and records scan-attempt metadata. Invitations remains the system of record for signed invitation validation, duplicate detection, RSVP data, and the atomic check-in row.

## API

- `GET /v1/events/:eventId/access-agents` lists agents for the authenticated event owner.
- `PUT /v1/events/:eventId/access-agents/:agentSubject` sets the complete ceremony grant list with `{ "ceremonyIds": ["..."] }`.
- `DELETE /v1/events/:eventId/access-agents/:agentSubject` revokes the agent and removes its grants.
- `GET /v1/check-in/events/:eventId` returns only assigned ceremony identifiers to an agent.
- `GET /v1/events/:eventId/check-in?ceremonyId=...` returns the ceremony's current check-in summary for an owner or an assigned agent.
- `POST /v1/events/:eventId/check-in/scan` forwards a scan to the private Invitations service route and records its outcome, hashed device identifier, operator subject, and bounded user-agent string. QR tokens and guest data are not persisted by Access.

Access verifies the caller's Keycloak access token. Owner operations are checked against Events. Agents must have an active grant for the requested ceremony. Invitations' internal endpoints require the shared `INVITATIONS_INTERNAL_TOKEN`; they must not be exposed through the public Gateway.

## Local setup

Set `ACCESS_DB_PASSWORD` and a random `INVITATIONS_INTERNAL_TOKEN` (at least 32 characters) in `.env`. Compose provisions the isolated `access_db`; the service runs its Prisma migrations at start. The realm issues the `access-api` audience to the web client.

## Known limits

Offline manifests and deferred sync are not implemented. Agent discovery is by Keycloak subject because user directory lookup/teams are not yet available. Summary currently delegates to Invitations and includes its existing recent guest names for authorized operators. Docker runtime, migration deployment, and full event-day concurrency remain to be verified in a live environment.
