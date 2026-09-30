# Guests service — Phase 3

NestJS/Fastify domain service. It owns `guest_db`, validates the Keycloak access token (`guests-api` audience) and asks the Events service to verify that the caller owns the event and that requested ceremonies belong to it.

## Data owned

- Guests with active/archive state, optional unique per-event email, phone and notes.
- Event-scoped guest groups, named companions and per-ceremony invitations with a companion allowance.
- Import jobs with the original rows, selected mapping, preview and idempotent completion summary.
- A transactional outbox for guest mutations and import lifecycle messages.

No foreign key crosses into Events. A ceremony reference is checked against Events with the caller's bearer token. Guest archive is a soft delete. The service does not read, change or publish event or ceremony data.

## Routes

Prefix `/v1/events/:eventId`:

- `GET /guests?limit=50&cursor=<uuid>` lists owner-scoped guests with cursor pagination; maximum page size is 100.
- `POST /guests`, `GET /guests/:guestId`, `PATCH /guests/:guestId`, `DELETE /guests/:guestId` create, read, update and archive guests.
- `GET/POST /guests/groups`, `PATCH/DELETE /guests/groups/:groupId` manage groups; deleting a group leaves its guests in the event and clears their group.
- `PUT /guests/:guestId/ceremonies` replaces the guest's ceremony-access list. `DELETE /guests/:guestId/ceremonies/:ceremonyId` removes one access.
- `POST /guest-imports` analyzes one upload; `GET /guest-imports/:jobId`, `PUT /guest-imports/:jobId/mapping`, `POST /guest-imports/:jobId/commit` complete the preview-and-confirm workflow.

## Import limits and behavior

CSV and XLSX only, up to 5 MiB, 1,000 data rows, 40 columns and 1,000 characters per cell. XLSX macros and malformed/oversized ZIP content are rejected; only the first visible sheet is read. The API stores a parsed snapshot for the import job so preview and commit refer to the same file contents. Mapping identifies full name and optional email, phone, notes, group and allowed-companion columns. Selected ceremonies are assigned to all valid imported guests.

Preview marks invalid rows, duplicate emails and spreadsheet formula-like values. The user explicitly confirms the import; valid rows and access records are written atomically, invalid rows are counted as skipped, and repeated commit requests return the stored result. Emails are normalized to lowercase and unique within an event. Guest changes and import transitions are recorded in the same database transaction as their corresponding outbox message.

## Local operation

List filters are performed by the service (`q` matches full name, email and phone; `groupId` narrows to an event group), and cursor pagination returns a maximum of 100 rows per request. A successful import removes the source row snapshot and full preview from the job record after guest/access rows and the completion summary are committed. Unfinished import source rows and preview data expire after 24 hours and are removed by the retention task.

Set `GUEST_DB_PASSWORD`, `DATABASE_URL`, Keycloak issuer/JWKS/client/audience, `EVENTS_SERVICE_URL`, `MAX_GUEST_IMPORT_BYTES`, and RabbitMQ management credentials in the service environment. `prisma migrate deploy` runs on service start. PostgreSQL bootstrap scripts only run for a fresh volume; when upgrading an existing volume, provision the `guests_service` role/database and apply migrations before starting the service.
