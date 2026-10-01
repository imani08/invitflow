# AI Design service

Phase 6 service for asynchronous design proposals and optional background previews.

## Runtime behavior

- `AI_PROVIDER=mock` produces a clearly labelled deterministic palette proposal for local development. It never claims to have called an AI model.
- `AI_PROVIDER=self-hosted` calls the configured OpenAI-compatible text model (`AI_PROVIDER_URL`, `AI_PROVIDER_MODEL`, optional `AI_PROVIDER_API_KEY`) for structured edits. Proposal operations are validated against the source design before being stored.
- If a self-hosted provider is selected, the worker also requires ComfyUI (`COMFYUI_BASE_URL`, `COMFYUI_CHECKPOINT`) to produce a low-resolution background preview. The preview is private in MinIO and served only after the caller's event/design ownership has been confirmed by Designs.
- Jobs are persisted with an outbox before being published to RabbitMQ. The worker claims jobs transactionally, recovers stale leases and queued work, and retries are limited to three attempts.
- Job creation enforces configurable hourly and concurrent quotas (`AI_MAX_ACTIVE_PER_OWNER=2`, `AI_MAX_ACTIVE_GLOBAL=20`, `AI_MAX_REQUESTS_PER_HOUR_PER_OWNER=10` by default). PostgreSQL advisory transaction locks serialize admissions so simultaneous requests cannot bypass the limits; failed-job retries also reserve active capacity. Current limits are per authenticated owner because workspace membership is not implemented yet.

## API

All routes require a Keycloak access token with the `ai-design-api` audience and access to the event design.

- `POST /v1/events/:eventId/designs/:designId/ai-jobs` with `{ "prompt": "..." }`
- `GET /v1/events/:eventId/designs/:designId/ai-jobs`
- `GET /v1/events/:eventId/designs/:designId/ai-jobs/:jobId`
- `GET /v1/events/:eventId/designs/:designId/ai-jobs/:jobId/preview`
- `DELETE /v1/events/:eventId/designs/:designId/ai-jobs/:jobId` while queued
- `POST /v1/events/:eventId/designs/:designId/ai-jobs/:jobId/retry` for failed jobs

Database migrations are applied by the service entrypoint. The service has no additional npm dependencies beyond those already used by the workspace services.
