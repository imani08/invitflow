# C4 conteneurs et frontières

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

| Conteneur | Responsabilité | Données / dépendances |
|---|---|---|
| Web Next.js | UI, BFF OIDC, appels proxifiés | Redis pour sessions chiffrées, Keycloak, Gateway |
| Admin Next.js | Shell de navigation vers vues admin existantes | Web / API protégées |
| Gateway | Proxy API, request IDs/correlation, headers et métriques | services, Identity token |
| Services métier | Règles de domaine isolées | PostgreSQL dédié par service |
| RabbitMQ | Jobs et événements versionnés | queues durables, retries/DLX selon configuration |
| Workers | Rendu invitations, traitements async, AI selon mode | RabbitMQ, snapshots DB, MinIO |
| Keycloak | OIDC, registration, required actions, rôles | PostgreSQL Keycloak |
| MinIO | Assets/quarantine et rendus privés | comptes IAM par usage |
| Mailpit | SMTP local de développement | port SMTP 1025, UI locale 8025 |
| Prometheus/Grafana/Tempo/Loki | Observabilité optionnelle | profil `observability`, maturité non uniforme |
