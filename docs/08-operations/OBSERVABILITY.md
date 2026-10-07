# Observabilité

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

Actuel: health liveness/readiness dans services, request/correlation ID et Prometheus HTTP metrics Gateway, Prometheus alert rules, RabbitMQ metrics plugin/export, exporters PostgreSQL/Redis dans profil `observability`, Grafana, OTEL Collector, Tempo/Loki configurés partiellement. `infrastructure/monitoring/README.md` précise que host CPU/memory/disk et business/payment metrics sont incomplets.

Pas de trace distribuée end-to-end prouvée. Pas d’alert delivery/runtime collector qualifié. Dashboards/alerts doivent être testés avec cible inaccessible et backlog/DLQ.

Diagramme `observability-architecture.mmd`; configuration `infrastructure/monitoring/` et RabbitMQ definitions.
