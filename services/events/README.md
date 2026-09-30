# Events Service — Phase 2

Owns events and their ceremonies in the isolated `event_db` database. Every query is scoped to the verified identity subject; callers cannot choose or override the owner. The service accepts only access tokens whose issuer, signature, expiry, client and `events-api` audience are valid and whose email has been verified.

## API (through the gateway)

- `POST /v1/events` — create a draft event.
- `GET /v1/events` — list the caller's events with pagination.
- `GET /v1/events/:eventId` — read one owned event and its ceremonies.
- `PATCH /v1/events/:eventId` — update editable event fields.
- `POST /v1/events/:eventId/publish` — publish an event with at least one scheduled ceremony.
- `POST /v1/events/:eventId/cancel` — cancel an event.
- `POST /v1/events/:eventId/ceremonies` — add a ceremony to an owned event.
- `PATCH /v1/events/:eventId/ceremonies/:ceremonyId` — update an owned ceremony.
- `DELETE /v1/events/:eventId/ceremonies/:ceremonyId` — remove an owned ceremony.

Dates must be ISO-8601 timestamps with an explicit UTC offset. Timezones use IANA identifiers. Event and ceremony names, dates, time ordering, statuses and supported event types are validated on the server. Ceremony records include type, venue, address, optional GPS coordinates, instructions, dress code, notes and capacity. Published events cannot be edited; cancel them instead. Cancellation is idempotent. Missing and foreign-owned resources both return `404`.

The database stores an event plus its ceremony schedule; event, ceremony and lifecycle changes write versioned messages to a transactional outbox. Publishing requires a scheduled ceremony. The publisher sends durable messages to the `invitaflow.events` RabbitMQ topic exchange and retains un-routed messages until a consumer queue is bound. Consumers should deduplicate by message ID. There is no guest, payment, design, invitation, notification or check-in behavior in this phase.

The Compose bootstrap creates the dedicated `events_service` database role on first PostgreSQL volume initialization. On an existing volume, provision that role/database grants using the bootstrap script and apply the Events migration. Realm audience configuration is imported only into a newly initialized Keycloak realm.
