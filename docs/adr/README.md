# Architecture Decision Records

Décisions fondées sur le dépôt. Les statuts restent descriptifs; ils ne remplacent pas une approbation formelle d’architecture.

- [ADR 0001 — Architecture de services métier](0001-microservices.md) — ACCEPTED — architecture observée
- [ADR 0002 — Keycloak pour OIDC](0002-keycloak.md) — ACCEPTED — code statique
- [ADR 0003 — RabbitMQ pour travaux et événements durables](0003-rabbitmq.md) — ACCEPTED — par domaine
- [ADR 0004 — Base par service](0004-database-per-service.md) — ACCEPTED — observé
- [ADR 0005 — Outbox transactionnelle et déduplication consommateur](0005-outbox-inbox.md) — PARTIAL — vérifier domaine par domaine
- [ADR 0006 — Abstraction provider paiement](0006-payment-provider-abstraction.md) — ACCEPTED — FlexPay réel bloqué
- [ADR 0007 — EasyPay adapter non qualifié](0007-easypay.md) — NOT VERIFIED — contrat sandbox/merchant requis
- [ADR 0008 — Wallet en unités de crédit](0008-wallet-credits.md) — ACCEPTED — code observé
- [ADR 0009 — MinIO pour objets privés](0009-minio-storage.md) — ACCEPTED — code, runtime à valider
- [ADR 0010 — Document de design versionné](0010-design-document-v2.md) — ACCEPTED — code observé
- [ADR 0011 — Acceptation légale au parcours d’inscription](0011-legal-registration.md) — ACCEPTED — parcours runtime à valider
- [ADR 0012 — Vérification email obligatoire](0012-email-verification.md) — ACCEPTED — tests E2E à faire
