# Designs service — Phase 5

NestJS/Fastify service for event templates and structured design documents. It owns `design_db`; it never reads another service's database. Every request validates the signed `designs-api` token and asks Events to confirm that the authenticated subject owns the event.

## Delivered

- A persisted, active template catalog with category, description, tags, version and preview metadata. The migration seeds four real starter compositions: three wedding directions and one birthday direction.
- Strict version 1 JSON documents with canvas, theme tokens, assets, variables, constraints, layouts, ceremony rules, export profiles and editable text/rectangle/background layers. Unknown fields, references, unsupported formats and unsafe values are rejected.
- Draft CRUD, archive, immutable snapshots, optimistic concurrency and restore-by-new-version. Every mutation and its versioned event are committed in one local transaction.
- Validation reports for safe margins and likely text overflow.
- Health endpoints and a least-privilege database login.

## API

All endpoints use `/v1/events/:eventId/designs`. Owner authorization is enforced through the Events service.

- `GET /templates?category=WEDDING` and `GET /templates/:templateId` read active templates.
- `GET` lists event drafts; `POST` creates a draft by cloning a persisted template.
- `GET /:designId`, `PUT /:designId`, `DELETE /:designId` read, update and archive a draft. Updates require `expectedVersion` and create a new immutable version.
- `GET /:designId/versions`, `POST /:designId/restore` inspect/restore history.
- `POST /:designId/validate` checks editor safe margins and likely text overflow.
- `/health`, `/health/live`, `/health/ready` provide health checks.

Images, SVG import, photo crop, QR generation, invitation exports and AI proposals are future service capabilities; no external asset URL is accepted or fetched here. The current editor supports the persisted text, background and rectangle layer types and uses its own undo/redo history.
