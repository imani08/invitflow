# Audit and administration service

Phase 11 service. It has an isolated `audit_db`, consumes the shared versioned event bus and stores append-only audit records. Event metadata uses a fixed allowlist so names, email addresses, phone numbers, notes, tokens and raw payloads are never copied into the audit database.

## Routes

- `GET /health/live` and `GET /health/ready` for container health.
- `GET /v1/admin/audit-events?limit=50&cursor=...&eventType=...&actorSubject=...` requires the `admin-api` Keycloak audience and `SUPPORT_ADMIN` or `SUPER_ADMIN` realm role.
- `POST /v1/moderation/reports` accepts idempotent, authenticated reports for an event, guest or invitation.
- `GET/PATCH /v1/admin/moderation-reports` lists and reviews reports for Support/Super Admins. Decisions are written to the immutable audit log.

The audit query is read-only. The database migration installs an append-only trigger on `audit_events`; idempotency is enforced by the source event ID. The event consumer retries transient insert failures through a delayed RabbitMQ retry queue and sends exhausted messages to its dead-letter queue.

The Web `/admin` console shares the opaque, HttpOnly Web session, shows the moderation queue and real audit entries, and links to the separately role-guarded Finance pricing console. The `apps/admin` origin redirects there so authorization has one session boundary. Finance writes continue to be enforced by the Billing API, not by hidden UI controls.

## Existing installations

`infrastructure/postgres/init-databases.sh` creates the `audit_service` login and `audit_db` only when a PostgreSQL volume is first initialized. For an existing volume, apply the same role/database provisioning with `AUDIT_DB_PASSWORD` before starting the service. Existing Keycloak realms must receive the `admin-api` client scope and audience mapper; realm JSON import does not update an already persisted realm.

Finance and Super Admin MFA still needs to be enabled and verified in the deployed Keycloak authentication flow before assigning those roles. The development realm defines the roles and OTP required action, but role-conditional enforcement is a deployment identity policy.
