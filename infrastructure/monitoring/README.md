# Local observability

The observability profile includes Prometheus, Grafana, Loki, Tempo, the OpenTelemetry Collector and PostgreSQL/Redis exporters. Start the stack with:

```powershell
docker compose --profile observability up -d
```

Prometheus scrapes Gateway, RabbitMQ, PostgreSQL and Redis over private Docker networks. Exporter ports are not published on the host. PostgreSQL uses a dedicated `postgres_exporter` login with the built-in `pg_monitor` role. Redis creates a separate `exporter` ACL user with the command permissions required by redis_exporter; application clients continue using the default Redis user. Set unique `POSTGRES_EXPORTER_PASSWORD` and `REDIS_EXPORTER_PASSWORD` values in `.env` before enabling the profile. Redis keyspace hit ratio, used memory and connected clients appear on the Grafana dashboard.

The Grafana dashboard at `infrastructure/monitoring/grafana/dashboards/gateway-overview.json` includes request latency by registered route, PostgreSQL connection saturation and Redis keyspace hit ratio, memory and client count. Alert rules report unavailable telemetry targets, database/Redis collection failures, PostgreSQL connection saturation and RabbitMQ backlog/DLQ conditions.

Static checks are included in CI: Prometheus validates its configuration and alert rules, and Trivy scans the pinned exporter images. Runtime startup, ACL authentication and metric collection still require a working Docker engine. Host/container CPU, memory and disk metrics, payment/business metrics and per-service application instrumentation are not provided yet.
