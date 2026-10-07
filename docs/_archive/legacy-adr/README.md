# Architecture Decision Records

Décisions dérivées des choix observables du dépôt. Le statut précise lorsqu’il s’agit d’une observation statique et non d’une approbation formelle.

- [ADR 0001 — Monorepo pnpm et Turborepo](0001-monorepo.md) — ACCEPTED — observé
- [ADR 0002 — Propriété des données par service](0002-service-database-ownership.md) — ACCEPTED — observé
- [ADR 0003 — OIDC Authorization Code avec PKCE](0003-oidc-pkce.md) — ACCEPTED — code statique
- [ADR 0004 — Événements via RabbitMQ et transactional outbox](0004-rabbitmq-outbox.md) — ACCEPTED — couverture par service varie
- [ADR 0005 — Objets privés pour médias et rendus](0005-private-object-storage.md) — ACCEPTED — code observé
- [ADR 0006 — Adaptateur PaymentProvider](0006-payment-provider-adapter.md) — ACCEPTED — FlexPay réel reste bloqué
- [ADR 0007 — Wallet crédit append-only](0007-credit-wallet-ledger.md) — ACCEPTED — code observé
- [ADR 0008 — Vérification email côté IdP et callback](0008-server-side-email-verification.md) — ACCEPTED — statique; e2e requis
- [ADR 0009 — Tokens de thème InvitaFlow](0009-brand-theme-tokens.md) — ACCEPTED — implémentation observée, conformité non vérifiée
- [ADR 0010 — Mailpit par défaut en local](0010-local-mailpit.md) — ACCEPTED — configuration à vérifier au déploiement
- [ADR 0011 — Événements financiers idempotents](0011-idempotent-financial-events.md) — ACCEPTED — tests ciblés à exécuter
- [ADR 0012 — Rendu invitations asynchrone](0012-invitations-asynchronous-rendering.md) — ACCEPTED — tests runtime non effectués


## Consolidation vers les ADR canoniques

Le contenu a été comparé aux ADR canoniques de `docs/adr/`. Informations pertinentes fusionnées : workspace pnpm/Turbo dans ADR 0001; PKCE/state/nonce dans ADR 0002; limites de couverture outbox et événements idempotents dans ADR 0005; double crédit ledger dans ADR 0008; tokens de thème dans architecture composants; Mailpit local dans ADR 0012. Les sujets de stockage MinIO, abstraction provider, ownership DB et rendu asynchrone sont représentés par les ADR canoniques indiquées ci-dessous. Ce dossier conserve les premiers textes pour historique, sans statut de référence.

| Fichier historique | Correspondance canonique |
|---|---|
| `0001-monorepo.md` | docs/adr/0001-microservices.md (related repository decision) |
| `0002-service-database-ownership.md` | docs/adr/0004-database-per-service.md |
| `0003-oidc-pkce.md` | docs/adr/0002-keycloak.md |
| `0004-rabbitmq-outbox.md` | docs/adr/0003-rabbitmq.md and docs/adr/0005-outbox-inbox.md |
| `0005-private-object-storage.md` | docs/adr/0009-minio-storage.md |
| `0006-payment-provider-adapter.md` | docs/adr/0006-payment-provider-abstraction.md |
| `0007-credit-wallet-ledger.md` | docs/adr/0008-wallet-credits.md |
| `0008-server-side-email-verification.md` | docs/adr/0012-email-verification.md |
| `0009-brand-theme-tokens.md` | docs/01-architecture/COMPONENT_ARCHITECTURE.md |
| `0010-local-mailpit.md` | docs/adr/0012-email-verification.md |
| `0011-idempotent-financial-events.md` | docs/adr/0005-outbox-inbox.md and docs/adr/0008-wallet-credits.md |
| `0012-invitations-asynchronous-rendering.md` | docs/adr/0005-outbox-inbox.md and docs/01-architecture/INVITATION_RENDERING_ARCHITECTURE.md |
| `README.md` | ADR index superseded by docs/adr/README.md |
