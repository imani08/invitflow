# Invitations / Rendering

Phase 9 and Phase 10 own invitation records, immutable per-invitation versions, batch snapshots, credit settlement, private generated files, signed QR links, ceremony-level RSVP and organizer check-in. Authenticated APIs pass through the Gateway; the narrow public invitation endpoints accept only signed invitation tokens.

## Batch workflow

`POST /v1/events/:eventId/invitations/batches` accepts `Idempotency-Key` and `{ "designId": "...", "guestIds": ["..."] }`. Omit `guestIds` to include all event guests. The API reads the event, pinned design revision, selected guests and ceremony seating once, stores a complete immutable render snapshot for each guest, and reserves one wallet credit per guest. It returns the batch and item states without waiting for PDF generation.

The Invitations API commits each `invitation.render.requested.v1` message to a transactional outbox. The outbox publishes to the durable RabbitMQ render queue. The separate `rendering` Compose service reads stored snapshots only and atomically claims up to eight items per work cycle. Batch and item rows remain the recovery source after worker restarts; individual Chromium failures retry up to three times. A successful batch stores one private PDF per guest and a ZIP containing the PDFs. A terminal render failure removes successful partial artifacts and settles zero credits. Cancelling a batch settles credits for completed PDFs and releases the rest; completed PDFs remain available.

## API

- `GET /v1/events/:eventId/invitations/batches` — recent batches for an event.
- `GET /v1/invitations/batches?eventId=...` — recent batches.
- `GET /v1/invitations/batches/:batchId` — status and item progress.
- `POST /v1/invitations/batches/:batchId/cancel` — cancel remaining work and settle completed items.
- `GET /v1/invitations/batches/:batchId/download` — ZIP once the batch completes.
- `GET /v1/invitations/batches/:batchId/items/:itemId/download` — one completed PDF.
- `GET /health`, `/health/live`, `/health/ready` — service health.

PDF and ZIP objects are stored in the private `invitations` MinIO bucket with a dedicated scoped service account. Individual PDFs and completed ZIPs stream from object storage through the API, Gateway and Web proxy. Rendering uses Chromium installed in the service image; no npm rendering or archive package is required. Wallet `SETTLEMENT` ledger entries return unused reserved credits atomically while consuming the number of completed invitations.

## Runtime configuration

Compose requires `INVITATIONS_DB_PASSWORD`, `MINIO_INVITATION_ACCESS_KEY` and `MINIO_INVITATION_SECRET_KEY`. New PostgreSQL volumes provision the invitation database and least-privilege role. Existing PostgreSQL and MinIO volumes need their new role, bucket, service account and Keycloak `invitations-api` audience applied through the corresponding bootstrap configuration.

The renderer produces a branded A5 invitation using the pinned design text, event, guest and ceremony snapshot data, with a signed QR link to `/invite/:token`. The QR token contains an invitation UUID and an HMAC signature; it contains no guest contact information. Configure `INVITATION_LINK_SECRET` with a high entropy secret and `PUBLIC_WEB_URL` with the browser-facing web origin. The invitation service image includes `qrencode` for SVG QR generation.

The public read route is `GET /v1/public/invitations/:token`; RSVP writes are `POST /v1/public/invitations/:token/rsvp` with one response per invited ceremony. Only event name/date/location, guest name, invited ceremonies and response state are returned. Guest email, phone, notes and internal ids beyond ceremony identifiers are not returned. A generated invitation is invalidated when its status changes to `REVOKED`; rotating the HMAC secret invalidates all existing QR links.

Organizer-only check-in routes are `POST /v1/events/:eventId/check-in/scan` and `GET /v1/events/:eventId/check-in?ceremonyId=...`. A unique invitation/ceremony record prevents duplicate attendance. The Web page supports QR camera scanning where `BarcodeDetector` is available and manual token entry elsewhere. RSVP updates are recorded in the transactional outbox as `invitation.rsvp.updated.v1`, published to the application event bus and delivered as in-app organizer notifications.
