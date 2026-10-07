# Plan de reprise après sinistre

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PLANNED**

| Scénario | Priorité reprise proposée | Dépendances |
|---|---|---|
| Perte DB service | restaurer DB/roles, appliquer schéma compatible | backups PostgreSQL, migrations, secrets |
| Perte MinIO/objets | restaurer bucket au même recovery point | réplication objets, policies/accounts, keys |
| Keycloak indisponible | restaurer DB realm puis valider OIDC/keys/required actions | backup DB et secrets issuer |
| RabbitMQ panne | restaurer définitions puis requeue depuis outbox | DB outboxes, DLX/retry config |
| Secret compromis | révoquer/rotater clé ciblée, invalidation éventuelle sessions/tokens | procédure provider, opérateur |
| Paiement mismatch | geler crédits/payout, rapprocher merchant | logs minimisés, order/ref, contrat |

RTO/RPO: **PROPOSED, à approuver**. Chiffrer backup en transit/repos; tester restauration isolée avant failback, vérifier balances ledger, invitation snapshots et objets référencés. Consigner communications clients/autorités selon avis juridique. Aucune promesse de continuité active-active n’est faite.
