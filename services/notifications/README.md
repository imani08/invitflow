# Notifications service

In-app notifications for event organizers. The service owns `notification_db`, verifies Keycloak access tokens (`notifications-api` audience), and consumes versioned messages from the shared RabbitMQ topic exchange. It creates notifications for published/cancelled events, completed guest imports, RSVP replies and confirmed, failed or refunded payments.

## User API (through Gateway)

- `GET /v1/notifications?limit=25&cursor=<uuid>&unread=true` — owner-scoped, newest-first page and total unread count.
- `PATCH /v1/notifications/:notificationId/read` — mark one owned notification read; repeating is safe.
- `POST /v1/notifications/read-all` — mark all of the caller's unread notifications read.
- `GET /v1/notifications/preferences` and `POST /v1/notifications/preferences` with `{ "enabled": false }` — read or set the global in-app notification preference. Notifications are enabled by default.
- `GET /health`, `/health/live`, `/health/ready` — service health.

## Delivery and privacy

Each notification is written once using the source event ID as a unique deduplication key. The stored event data is limited to identifiers needed by the web app; guest names, email addresses and phone numbers are not copied into notifications. User-facing reads and changes always scope by the authenticated identity subject.

The consumer reads one message at a time through RabbitMQ Management HTTP and uses the durable 30-second retry queue and a dead-letter queue after ten failures. This consumer acknowledges the fetched message before processing; replace it with AMQP manual acknowledgements before relying on it for production delivery guarantees. Email and SMS are not active: several source events do not currently include a verified recipient address, and the service does not send messages externally.

## Local setup

Compose provisions `notification_db` and the least-privilege `notifications_service` login from `NOTIFICATIONS_DB_PASSWORD`. New PostgreSQL volumes create these automatically. Existing volumes need that role/database and `notifications-api` Keycloak audience added before starting the service; the RabbitMQ definitions need to be applied to an already-persisted broker.
