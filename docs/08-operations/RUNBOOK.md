# Runbook local

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

## Pré-requis et démarrage

Node 24–26, pnpm 12.8, Docker Desktop Compose v2. Copier `.env.example` vers `.env`, générer des secrets uniques pour local, conserver `MAIL_PROVIDER=mailpit`, installer `pnpm install`, puis `pnpm infra:up`. Compose est une stack dev uniquement.

```powershell
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs --tail 200 <service>
docker compose restart <service>
docker compose build <service>
docker compose down
```

Ne pas utiliser `down -v` sans plan explicite de destruction données.

## Diagnostic

1. `docker compose ps --all`, regarder health/exit code.
2. `docker compose logs --tail 200 keycloak keycloak-email-init keycloak-legal-flow-init` pour bootstrap.
3. Inspecter `postgres` et `*-db-init` sans afficher passwords; contrôler migrations par service.
4. Vérifier Ready `/health/ready`, Gateway `/health/live`, Mailpit UI localhost:8025, RabbitMQ management localhost:15672, MinIO console localhost:9001.
5. Pour queue: dashboard RabbitMQ, backlog/retry/DLQ; ne pas supprimer messages sans capture.
6. Pour media: état d’asset, clamd health, quarantine/ready buckets; ne jamais rendre bucket public.
7. Pour paiement: commencer `PAYMENT_PROVIDER=mock`; ne jamais configurer provider réel sans contrat/sandbox confirmé.
8. Exportes observability via `docker compose --profile observability up -d` et credentials uniques.

## Migrations / bootstrap

Entrypoints DB-init créent roles/bases sur volume neuf/existant; Keycloak bootstrap audiences/legal/email est idempotent; MinIO bootstrap policies/accounts. Vérifier logs job exit 0 et migration status. Ne pas reset volumes pour corriger un bootstrap.

## Incidents fréquents

- Mail non reçu local : confirmer `MAIL_PROVIDER=mailpit`, job `keycloak-email-init`, mailpit health et boîte UI 8025.
- SMTP échoue : confirmer mode explicit `smtp`, host/port/TLS/username/password depuis secret sans imprimer sa valeur.
- Callback OIDC refusé : regarder cause/ID correlation sans afficher token; vérifier redirect URI, realm/client, PKCE state et `email_verified`.
- Rendu attente : examiner outbox, queue, worker, batch items, MinIO et DLQ; retry limité selon service.
- Docker unavailable : vérifier Desktop engine/socket puis `docker info`; ne pas déclarer health inconnue PASS.

Contacts opérateur: `fucushd098@gmail.com`, `+243973431495`.
