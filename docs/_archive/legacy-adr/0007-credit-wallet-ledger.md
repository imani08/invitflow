# ADR 0007 — Wallet crédit append-only

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — code observé**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Les crédits sont un ledger métier d’unités d’usage, pas argent stocké.

## Conséquences

Traçabilité et idempotence; réconciliation par opérations compensatoires.

## Sources

Wallet Prisma, ledger handlers/consumers.
