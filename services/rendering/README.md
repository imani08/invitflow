# Rendering worker

Phase 9/10 worker runtime is exposed as the `rendering` Compose service and currently builds from `services/invitations/Dockerfile` so it can share the Invitations Prisma schema, immutable batch snapshots and signed QR renderer without another runtime dependency graph. `RENDER_WORKER_ENABLED=true` activates its bounded Chromium worker; the Invitations API container leaves that worker disabled. The runtime image includes `qrencode` and inherits `INVITATION_LINK_SECRET` and `PUBLIC_WEB_URL` from the Invitations service environment.

See [services/invitations/README.md](../invitations/README.md) for snapshot contents, queue behavior, retries, private PDF/ZIP storage and the batch API.
