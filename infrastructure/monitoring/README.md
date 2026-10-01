# Local observability

The observability profile includes Prometheus, Grafana, Loki, Tempo, the OpenTelemetry Collector and a PostgreSQL exporter. Start the stack with:

```powershell
docker compose --profile observability up -d
```

Prometheus scrapes Gateway, RabbitMQ and PostgreSQL over private Docker networks. PostgreSQL metrics remain internal; no exporter port is published on the host. The exporter uses a dedicated `postgres_exporter` login with the built-in `pg_monitor` role. Set a unique `POSTGRES_EXPORTER_PASSWORD` in `.env` before enabling the profile. The idempotent `postgres-exporter-db-init` job provisions the login on both new and existing Postgres volumes.

The Grafana dashboard at `infrastructure/monitoring/grafana/dashboards/gateway-overview.json` includes request latency by registered route and PostgreSQL exporter/collection availability. Alert rules report unavailable telemetry targets, database collection failures and RabbitMQ backlog/DLQ conditions.

Static checks are included in CI: Prometheus validates its configuration and alert rules, and Trivy scans the pinned exporter image. Runtime startup, credentials and metric collection still require a working Docker engine. CPU, disk, Redis metrics, business metrics and per-service application instrumentation are not provided yet.
