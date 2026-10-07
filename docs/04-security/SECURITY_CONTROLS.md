# Registre des contrôles sécurité

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

| Contrôle | Source | État |
|---|---|---|
| PKCE S256/state/nonce et session BFF | auth-session, callback | code présent; runtime non vérifié |
| Realm email verification / duplicate prevention | realm export, provision-email | config présente |
| Verified-email claim required | callback web | implemented |
| AuthZ service/role | guards/controller décorateurs | code présent, couverture incomplète |
| DB isolation | Prisma schemas, Postgres provisioners, Compose | config présente |
| Image quarantine/clamav/decode | Media | code et tests; scanner runtime non vérifié |
| MinIO least privilege/private bucket | infrastructure/minio, policies | configuration; runtime IAM non vérifié |
| Payment idempotency/ledger | Payments/Wallet | code/tests par service |
| HTTP security headers / request context | Gateway, Web CSP | code présente; proxy déploiement à vérifier |
| Observability alert rules | `infrastructure/monitoring` | config présente; alert delivery non testé |
| Vulnerability / dependency scan | CI workflows if configured | voir workflows; ne pas supposer audit exhaustif |

Ce registre se met à jour à partir des configs et rapports réellement exécutés.
