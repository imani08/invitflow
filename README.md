# InvitaFlow

InvitaFlow is a platform for creating, personalizing, distributing and managing event invitations. The repository contains partial implementations across the 12 planned phases (0–11); they are not yet verified as production-ready. See [the remaining work register](docs/REMAINING_WORK.md) for the phase-by-phase gaps and blockers.

## Architecture

- `apps/web` — public Next.js landing page, OIDC BFF routes and authenticated profile, notifications, wallet, event, ceremony, guest, seating, design and invitation workspaces
- `apps/admin` — navigation to the existing role-protected web consoles; support/moderation is at `/admin`, finance pricing at `/admin/pricing`, and payment review at `/admin/finance`
- Gateway exposes bounded-cardinality Prometheus request counters and duration histograms at `/metrics` on the internal observability network
- RabbitMQ exposes per-queue ready/unacknowledged depth and consumer count to Prometheus over a dedicated internal metrics network; Prometheus alerts on sustained backlog and non-empty dead-letter queues
- The opt-in observability profile scrapes PostgreSQL and Redis exporters on private networks, with alerts for connection saturation and exporter/Redis availability
- `apps/gateway` — NestJS on Fastify with health route, request IDs, security headers and profile, events, guests, seating, designs, invitations, audit, wallet, billing and payments API proxies
- `services/profile` — Keycloak-token protected profile API with its own Prisma schema, migrations and database login
- `services/media` — owner-scoped image uploads to a private quarantine bucket, Sharp pixel decoding/re-encoding to original, preview and thumbnail WebP variants, metadata stripping and signed downloads from the private ready bucket
- `services/events` — Keycloak-token protected event and ceremony API, isolated database, versioned contracts and transactional outbox publisher
- `services/guests` — Keycloak-token protected guest, group, companion and ceremony-access API, isolated database, CSV/XLSX import pipeline and transactional outbox publisher
- `services/seating` — Keycloak-token protected per-ceremony table, zone and guest-placement API, CSV/XLSX table import and transactional outbox in its own isolated database
- `services/designs` — Keycloak-token protected template catalog and versioned design JSON editor API with its own database and transactional outbox
- `services/wallet` — Keycloak-protected user balance/ledger reads and service-token-only idempotent credit, reservation, consumption, release and reversal operations in `wallet_db`
- `services/billing` — Keycloak-protected versioned price catalog/quotes and finance-admin schedule publication in `billing_db`
- `services/payments` — immutable order snapshots, provider-neutral checkout, Mock/FlexPay adapters, reconciliation and transactional payment events in `payment_db`
- `services/notifications` — owner-scoped in-app notifications, preferences and event deduplication in `notification_db`
- `services/audit` — append-only, PII-filtered event audit ingestion and support-admin queries in `audit_db`
- `services/invitations` — owner-scoped immutable invitation snapshots, batches, Wallet reservation/settlement, PDF and ZIP download APIs in `invitation_db`
- `rendering` Compose worker — bounded Chromium rendering from immutable snapshots, private MinIO output and retry/recovery
- other `services/*` — independent domain boundaries, not active yet
- `packages/contracts`, `packages/ui`, `packages/observability` — small shared foundations
- `infrastructure/` — local identity, messaging, database and observability configuration

Each active service owns its database. PostgreSQL is on a private Docker network and has no published host port. Bootstrap provisions separate database logins for Profile, Events, Guests, Seating, Designs, Invitations, Wallet, Billing, Payments, Notifications and Audit. Do not share credentials or Prisma clients between services.

RabbitMQ uses durable event, audit and render queues plus delayed retry queues and a dead-letter exchange. Domain events and render requests are written to transactional outboxes before publication. The Rendering worker claims invitation items idempotently from database snapshots; Audit deduplicates published events in its isolated database; a recovery sweep resumes render work after worker restarts. A dedicated Wallet consumer handles only verified payment-success events and writes purchases idempotently.

## Node.js support

Development recommended: Node.js 26.10.0 (recorded in `.nvmrc` and `.node-version`). Compose development containers use `node:26.10.0-slim`; production Dockerfiles default to Node.js 24.21.0 LTS. The repository accepts `>=24 <27`; Node 27 and later need an explicit compatibility decision. CI runs lint, typecheck, unit tests and the full build on Node 24.21.0 and 26.10.0. Local validation on Node 26.10.0 passes, including Prisma Client generation, but Prisma 7.10.0's installer still warns that its vendor support list covers Node 20, 22 and 24 only; see the remaining-work register.

On Windows, install Node.js 26.10.0 using your preferred installer, then install the pinned pnpm version with npm. Corepack and NVM are optional.

```powershell
node -v
npm -v
npm install -g pnpm@12.8.0
pnpm -v
```

## Prerequisites

- Node.js 26.10.0 for development; Node.js 24.21.0 LTS for production
- pnpm 12.8.0
- Docker Desktop with Compose v2

## Install and environment

```powershell
Copy-Item .env.example .env
# Replace every CHANGE_ME value with a unique, strong local password before starting containers.
pnpm install
```

`pnpm-lock.yaml` pins the package graph and installs must use `--frozen-lockfile` in CI. Use `.env.example` as a list of local settings; it contains placeholders only. Never commit `.env` or production secrets. Passwords used in local development must be replaced before any deployment outside a local environment.

## Start infrastructure

```powershell
pnpm infra:up
docker compose ps
pnpm infra:down
```

The Compose stack is intended for local development, not a production deployment. Databases, Redis and internal brokers are not published to the host. Public development consoles bind to `127.0.0.1`.

For authentication and database isolation, choose unique URL-safe `PROFILE_DB_PASSWORD`, `EVENT_DB_PASSWORD`, `GUEST_DB_PASSWORD`, `SEATING_DB_PASSWORD` and `DESIGNS_DB_PASSWORD` values, a unique URL-safe `REDIS_PASSWORD`, and an `AUTH_SESSION_SECRET` of at least 32 random characters. When enabling observability, also set unique `POSTGRES_EXPORTER_PASSWORD` and `REDIS_EXPORTER_PASSWORD` values; the exporters use dedicated read-only PostgreSQL/Redis monitoring access. For example, generate a secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Redis stores encrypted server-side OIDC session records; the browser receives only an opaque HttpOnly cookie. Replace every sample password before running beyond local development.

## Development commands

```powershell
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:workspace
```

`pnpm infra:up` is the supported local end-to-end startup because the web BFF and profile API depend on Compose service DNS. The observability stack is opt-in to keep the default development stack lighter: start it with `docker compose --profile observability up -d`. It scrapes Gateway, RabbitMQ and PostgreSQL; exporter credentials and details are in [the observability guide](infrastructure/monitoring/README.md). `pnpm dev` is for focused workspace development after providing that service's environment and dependencies. `pnpm check:workspace` validates package manifests. Tests must be added with the service slices that need them; scaffolds do not imply business behavior.

## Local URLs

| Component              | URL                                                                                                                                                                                                                           | Status                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Web                    | http://localhost:3000 (`/events`, `/account`, `/admin`, finance `/admin/pricing` and `/admin/finance`, `/events/<eventId>/guests`, `/events/<eventId>/seating`, `/events/<eventId>/designs`, `/events/<eventId>/invitations`) | Compose port configured; runtime not yet verified                                                                   |
| Admin                  | http://localhost:3001 provides navigation to the existing role-protected moderation, finance and pricing views                                                                                                                | Compose port configured; runtime not yet verified                                                                   |
| Gateway                | http://localhost:3002/health, `/health/live`, `/health/ready`, `/metrics`                                                                                                                                                     | Prometheus scrape configured; runtime not yet verified                                                              |
| Events API             | Through Gateway at `/v1/events`                                                                                                                                                                                               | Phase 2 routes implemented; runtime not yet verified                                                                |
| Guests API             | Through Gateway at `/v1/events/:eventId/guests` and `/guest-imports`                                                                                                                                                          | Phase 3 routes implemented; runtime not yet verified                                                                |
| Seating API            | Through Gateway at `/v1/events/:eventId/ceremonies/:ceremonyId/seating`                                                                                                                                                       | Phase 4 routes implemented; runtime not yet verified                                                                |
| Designs API            | Through Gateway at `/v1/events/:eventId/designs`                                                                                                                                                                              | Phase 5 routes implemented; runtime not yet verified                                                                |
| Wallet API             | Through Gateway at `/v1/wallet/me` and `/v1/wallet/me/transactions`                                                                                                                                                           | Phase 7 routes implemented; runtime not yet verified                                                                |
| Billing API            | Through Gateway at `/v1/pricing`, `/v1/quotes`, and finance-admin `/v1/admin/price-schedules`                                                                                                                                 | Partial Phase 7 implementation; runtime not yet verified                                                            |
| Payments API           | Through Gateway at `/v1/payments`, `/v1/payments/me`, and the reserved FlexPay callback `/v1/payments/webhooks/flexpay`                                                                                                       | Mock works locally; FlexPay awaits the official RDC merchant API contract                                           |
| Finance payments       | `/admin/finance` and finance-admin `GET /v1/admin/payments?provider=flexpay`                                                                                                                                                  | Added; runtime and authorization not yet verified                                                                   |
| Notifications API      | Through Gateway at `/v1/notifications` and `/v1/notifications/preferences`                                                                                                                                                    | In-app notifications implemented; runtime not yet verified                                                          |
| Invitations API        | Through Gateway under `/v1/events/:eventId/invitations/batches`, `/v1/events/:eventId/check-in`, and public `/v1/public/invitations/:token`                                                                                   | Phase 9 and Phase 10 routes implemented; runtime not yet verified                                                   |
| Audit / moderation API | Reports at `/v1/moderation/reports`; Support console at `/v1/admin/audit-events` and `/v1/admin/moderation-reports`                                                                                                           | Verified-email session; admin routes require Support/Super Admin and `admin-api` audience; runtime not yet verified |
| Keycloak               | http://localhost:8080                                                                                                                                                                                                         | Dev realm config; runtime not yet verified                                                                          |
| RabbitMQ Management    | http://localhost:15672                                                                                                                                                                                                        | Local broker console; runtime not yet verified                                                                      |
| MinIO API / Console    | http://localhost:9000 / http://localhost:9001                                                                                                                                                                                 | Buckets bootstrapped locally; runtime not yet verified                                                              |
| Mailpit                | http://localhost:8025                                                                                                                                                                                                         | SMTP `localhost:1025`; runtime not yet verified                                                                     |
| Traefik dashboard      | http://localhost:8088                                                                                                                                                                                                         | Dashboard; runtime not yet verified                                                                                 |
| Prometheus / Grafana   | http://localhost:9090 / http://localhost:3005                                                                                                                                                                                 | Runtime not yet verified                                                                                            |
| Tempo / Loki           | http://localhost:3200 / http://localhost:3100                                                                                                                                                                                 | Runtime not yet verified                                                                                            |

## Identity and Profile (Phase 1)

Keycloak owns registration, login, email verification, password reset/change and identity roles. Login uses OIDC Authorization Code with PKCE, state and nonce checks. The Next.js BFF stores encrypted access/refresh tokens in Redis and sends only an opaque HttpOnly cookie to the browser. The Profile Service verifies Keycloak signatures, issuer, audience, authorized party, expiry and verified email before reading or writing its own PostgreSQL database. It exposes only `GET/PUT /v1/me`; no password or token fields are stored in profile records.

The realm file is imported only when Keycloak initializes a new realm. Existing persisted Keycloak realms are not overwritten automatically. Customer registration defaults to the `CUSTOMER` realm role; admin APIs enforce realm roles independently of UI visibility. Configure and test role-specific MFA before assigning finance or super-admin privileges. Hosted Keycloak account screens perform registration, email verification, password reset and password changes; Mailpit receives development mail at http://localhost:8025.

## Health and operations

Compose health checks are configured for PostgreSQL, Redis, RabbitMQ, MinIO, Keycloak, Mailpit, Gateway, Profile, Events, Guests, Seating, Designs, Wallet, Billing, Payments, Notifications, Invitations/Rendering and Audit. The gateway exposes `/health`, `/health/live` and `/health/ready`; domain services expose liveness and database readiness routes. Check a container with `docker compose ps` and logs with `docker compose logs <service>`.

Phase 11 audit consumes versioned events from RabbitMQ into append-only `audit_events`; a strict metadata allowlist excludes free text, contact fields and tokens. The support console at `/admin` reviews authenticated reports and reads audit entries; reports can be filed from `/account/report`. Gateway responses include restrictive browser security headers and its request URL is redacted from logs to prevent signed invitation tokens being written in access logs. Configure and verify MFA for Finance/Super Admin roles in Keycloak before granting them.

## Guests (Phase 3)

The event workspace links to `/events/<eventId>/guests`. The guest API is scoped to an event owner and verifies event ownership by forwarding the signed Keycloak token to Events. Guests, optional email and phone, named groups, companions and per-ceremony invitation/access are stored in `guest_db`; access never creates a ceremony in the Events database. Guest deletion is a soft archive.

The guest list supports cursor pagination and server-side name/email/phone search and group filtering. Imports accept a single `.csv` or `.xlsx` file up to 5 MiB, 1,000 guest rows, 40 columns and 1,000 characters per cell. The first visible worksheet is read; macros are rejected. Column mapping supports a full-name field or separate first/last name fields, and per-ceremony access and companion-count columns. Mapping is previewed before the user confirms. Invalid rows are listed and skipped, while valid rows are committed atomically; repeated commit requests return the saved result. Formula cells and spreadsheet-like values are flagged. Source rows and detailed preview data are purged after success, and abandoned import data expires after 24 hours. Upload and JSON operations go through the cookie-authenticated Next.js BFF and Gateway.

Routes include `GET/POST /v1/events/:eventId/guests`, `GET/POST/PATCH/DELETE /guests/groups`, `GET/PATCH/DELETE /guests/:guestId`, `PUT /guests/:guestId/ceremonies`, and `POST /v1/events/:eventId/guest-imports` followed by `GET /:jobId`, `PUT /:jobId/mapping` and `POST /:jobId/commit`. Every guest operation requires a verified token and checks ownership through Events and owner-scoped database queries. Outbox events cover guest changes and import lifecycle.

## Seating (Phase 4)

The event workspace links to `/events/<eventId>/seating`. Each ceremony has its own `NO_SEATING`, `TABLE` or `ZONE` mode. Tables have unique names and optional numbers, capacity, category and notes. Zones have unique names and optional capacity, category and notes. Organizers can create and delete tables or zones, place invited guests, move an existing assignment, and remove an assignment. Occupancy reserves one place for the guest plus their allowed companions for that ceremony at the time the assignment is saved. It is a snapshot; save the assignment again after changing companion allowances. Capacity excess is shown as a warning so the organizer can correct it without losing an assignment.

Seating owns `seating_db` and stores only event, ceremony and guest identifiers across service boundaries. Every request verifies event ownership and ceremony membership through Events. Each assignment additionally asks Guests to verify the guest and the ceremony invitation. Seating never reads those services' databases directly. Routes are under `/v1/events/:eventId/ceremonies/:ceremonyId/seating`: `GET/PUT` for plan mode; CRUD under `/tables` and `/zones`; `GET/POST /assignments`; `DELETE /assignments/:guestId`; and `POST /imports`, `GET /imports/:jobId`, `POST /imports/:jobId/commit` for table spreadsheet preview and confirmation. Mutations and outbox events commit together; the publisher routes versioned events to RabbitMQ. The web BFF forwards the session token and blocks cross-origin writes.

The development realm adds the `seating-api` audience to the web client. Keycloak imports that scope only when it initializes a new realm. Add the scope to an existing persisted development realm before using the new service.

## Design Engine (Phase 5)

Each event links to `/events/<eventId>/designs`. The catalog reads active, versioned templates from the Designs database and filters by event category. The starter library contains three distinct wedding layouts and one birthday layout. Choosing a template creates a persisted event draft. The editor manages canvas text, rectangle and background layers, text variables, palette, typography, size, rotation, position snapping, layer order, locks, duplication and undo/redo. Saving uses optimistic concurrency and appends an immutable version. Previous versions can be restored as a new version, drafts can be archived, and the validator reports safe-margin, text-fit, contrast and font-catalog issues.

The document JSON is the source of truth. The current editor covers text, backgrounds and rectangles. Photo upload/replacement and crop require the Media phase; invitation rendering is handled in Phase 9 and signed QR / RSVP flows in Phase 10. The bundled font choices use system fonts only. The design service owns `design_db`, checks event ownership through Events, and writes outbox messages atomically with mutations. The development realm adds `designs-api`; a realm already persisted by Keycloak must receive that scope before using the service.

## AI Design (Phase 6)

The editor can queue an AI design job, show its status, retry failed work and review a structured proposal before applying it. Jobs and outbox records live in the isolated `ai_design_db`; RabbitMQ delivers work to the AI worker. Proposals are constrained to supported edits on existing unlocked layers and are only applied in the editor until the user saves. They are tied to the source design version, so a stale proposal cannot be applied.

`AI_PROVIDER=mock` is the default local mode and is explicitly labelled as simulated; it does not call an AI model or generate an image. To enable real proposals set `AI_PROVIDER=self-hosted`, `AI_PROVIDER_URL`, and `AI_PROVIDER_MODEL` for an OpenAI-compatible self-hosted model. To produce a raster background preview, also configure `COMFYUI_BASE_URL` and `COMFYUI_CHECKPOINT` for a self-hosted ComfyUI instance. Generated PNG previews are limited to 2 MB, stored privately in the `previews` bucket with a scoped MinIO account, and removed with expired jobs after 30 days. The proposal API is available through Gateway at `/v1/events/:eventId/designs/:designId/ai-jobs`.

The AI Design service owns `ai_design_db`; the development Keycloak realm adds the `ai-design-api` audience and RabbitMQ definitions add the job queue. A previously persisted PostgreSQL volume needs the `ai_design_service` role/database provisioned, and existing Keycloak, RabbitMQ and MinIO data need their Phase 6 realm, definitions and scoped preview account applied before the service can run.

## Billing / Wallet (Phase 7)

`/account/wallet` reads the signed-in user's actual credit balance, ledger history and active persisted price catalog. A newly created wallet starts at zero; this phase grants no sample or signup credits. The immutable wallet ledger and balance projection update in the same transaction, with nonnegative database constraints and idempotency keys. Invitation generation can reserve credits, consume them on success, or release them on failure through Wallet's internal service-token API. Corrections append reversal entries instead of editing history. Finance admins and super admins can publish future versions from `/admin/pricing`.

Billing owns `billing_db` and persists versioned price schedules. The initial migration loads the specification's indicative USD credit packs and the rule `1 final personalized invitation = 1 credit`; previews and tests cost zero. Price schedule, pack and rule rows reject updates/deletes at database level. Finance admins publish a new schedule with a future UTC effective time; historical versions stay available for purchase/quote snapshots.

The wallet page offers pack checkout and payment history. `PAYMENT_PROVIDER=mock` is a development-only end-to-end workflow: an explicitly labelled test confirmation emits the same versioned success event used by provider payments. `PAYMENT_PROVIDER=flexpay` selects the FlexPay adapter, which currently fails closed pending the official RDC merchant API contract. Orders keep their price and credit snapshots if a later Billing schedule changes. Existing CinetPay provider values remain unchanged in historical payment rows.

Payments owns `payment_db`, uses an outbox for `payment.created.v1`, `payment.succeeded.v1`, `payment.failed.v1` and reconciliation anomaly events, and periodically compares provider transactions against local states. Finance admins can read open reconciliation anomalies through `/v1/admin/reconciliation/issues`. The database enforces unique provider transaction IDs and webhook receipts; the Wallet's payment consumer is idempotent.

The finance refund API runs an explicitly simulated refund for Mock payments in development and reverses the matching Wallet purchase through RabbitMQ. FlexPay refunds remain unavailable until the official provider contract is integrated. Real financial refunds, invoice numbering/PDFs, provider settlement imports and finance dashboards remain future work; do not offer customer refunds until the provider status and credit reversal policies are complete.

The development realm adds `wallet-api`, `billing-api` and `payments-api`. A previously initialized PostgreSQL volume needs `wallet_service`, `billing_service` and `payments_service` roles/databases provisioned manually; an existing Keycloak realm needs these audiences added. Configure unique `WALLET_DB_PASSWORD`, `BILLING_DB_PASSWORD`, `PAYMENT_DB_PASSWORD`, and a high-entropy `WALLET_INTERNAL_TOKEN` in `.env`.

For local checkout use `PAYMENT_PROVIDER=mock`. FlexPay onboarding and the official RDC merchant API contract are needed before enabling `PAYMENT_PROVIDER=flexpay`. Configure `FLEXPAY_ENV`, `FLEXPAY_BASE_URL`, `FLEXPAY_MERCHANT_CODE`, `FLEXPAY_AUTH_TOKEN`, `FLEXPAY_CALLBACK_URL` and `FLEXPAY_RETURN_URL` using server-side secret management. The auth token is never exposed to the browser.

## Troubleshooting

- Compose requires the variables marked as required in `compose.yaml`; copy `.env.example`, replace every `CHANGE_ME`, and set unique local passwords first.
- If image pulls are unavailable, Compose cannot start until Docker can reach its configured registry.
- Do not expose development ports to a network; all host-published consoles bind to loopback.
- Database bootstrap runs only when the PostgreSQL data volume is first initialized. If that volume predates Phase 5, provision the `design_db` owner role and apply the Designs migration before starting the app.
- Phase 6 adds `ai_design_db`, `ai_design_service`, an `ai-design-api` Keycloak audience, the `ai-design.jobs` RabbitMQ queue and a scoped MinIO user. Existing persisted volumes need these additions applied because their bootstrap files are not rerun automatically.
- Phase 7 adds `wallet_db`, `billing_db`, their isolated logins and the `wallet-api` / `billing-api` audiences. The migration seed creates the initial pricing catalog. Existing persisted Postgres and Keycloak volumes need their new roles/databases and audiences provisioned separately.
- Phase 8 adds `payment_db`, `payments_service`, the `payments-api` audience and payment/retry queues. Existing Postgres and Keycloak volumes need their new role/database and audience added; RabbitMQ imports new queues from the definitions file. Restart or apply definitions to an existing persisted RabbitMQ instance before processing purchases.
- Notifications adds the `notifications_service` role and `notification_db`, the `notifications-api` audience, and an event/retry/DLQ queue. Existing Postgres and Keycloak volumes need these additions provisioned; apply RabbitMQ definitions to an existing persisted broker.
- Phase 9 adds `invitations_service` and `invitation_db`, the `invitations-api` audience, a durable render queue, and a scoped MinIO invitation user. Existing Postgres, Keycloak, MinIO and RabbitMQ volumes need these additions applied before the new service starts.
- Phase 11 adds `audit_service` and `audit_db`, the `admin-api` audience, and RabbitMQ audit/retry/dead-letter queues. Existing PostgreSQL, Keycloak and RabbitMQ volumes need the database role, audience mapper and queue definitions applied before starting the back-office.

## Phase plan and actual status

The development plan has **12 phases numbered 0 to 11**, as defined in the InvitaFlow master development prompt:

0. Foundation
1. Identity & Profile
2. Events
3. Guests
4. Seating
5. Design Engine
6. AI Design
7. Billing / Wallet
8. Payments
9. Invitation / Rendering
10. QR / RSVP / Check-in
11. Administration et modération / Hardening

The domain slices have meaningful code, but each is partial against the cahier des charges. In particular, Media, Access and Analytics still need runtime integration validation; FlexPay is not connected; invoices/legal acceptance, email delivery and full business analytics remain outstanding. Backup/restore scripts and an operations procedure exist, but no real recovery drill has passed. Production observability, remote CI/security scan results and end-to-end/load verification also remain outstanding. Do not treat any phase as launch-ready until its acceptance checks pass. The complete gap register is in [docs/REMAINING_WORK.md](docs/REMAINING_WORK.md).
