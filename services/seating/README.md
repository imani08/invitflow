# Seating service — Phase 4

NestJS/Fastify service for ceremony seating plans. It owns `seating_db` and never reads another service's database. Every request validates the signed `seating-api` token, asks Events to confirm ownership of the event and ceremony, and asks Guests to confirm an assigned guest's ceremony access.

## Behavior

- A ceremony can use `NO_SEATING`, `TABLE`, or `ZONE` mode.
- Tables have a unique name, optional number, capacity, category and notes. Zones have a unique name and optional capacity, category and notes.
- A guest can have one placement per ceremony. The service reserves one seat for the guest plus the ceremony's `allowedCompanions` value returned by Guests at assignment time. That count is a snapshot until the assignment is saved again.
- Capacity is surfaced as `occupied` and `overCapacity`; organizers can see and correct over-allocation without losing an assignment.
- A mode cannot change while the ceremony has tables, zones, or assignments. Deleting a table or zone removes its assignments in the same database through a local cascade.
- Data references to Events and Guests are identifiers only; there are no cross-database foreign keys.
- Mutations and their versioned domain events commit together to the transactional outbox. A publisher sends them to the shared `invitaflow.events` exchange.

## API

All routes are under `/v1/events/:eventId/ceremonies/:ceremonyId/seating` and require a verified owner token.

- `GET` and `PUT` read or set the ceremony mode.
- `GET/POST /tables`, `PATCH/DELETE /tables/:tableId` manage tables.
- `GET/POST /zones`, `PATCH/DELETE /zones/:zoneId` manage zones.
- `GET/POST /assignments` list or upsert a guest placement; `DELETE /assignments/:guestId` removes it.
- `POST /imports` analyzes a CSV/XLSX table list; `GET /imports/:jobId` reads the preview; `POST /imports/:jobId/commit` confirms all valid rows atomically. Import previews expire after 24 hours.
- `GET /health`, `/health/live`, `/health/ready` provide service health.

Capacity limits are warnings, consistent with the organizer correcting a proposed plan. Assignments are scoped by verified owner, event and ceremony. Import accepts at most 5 MiB, 1,000 rows and 40 columns; the `.xlsx` parser validates archive expansion limits and rejects macros, and `.csv` must be UTF-8. Invalid rows block confirmation.
