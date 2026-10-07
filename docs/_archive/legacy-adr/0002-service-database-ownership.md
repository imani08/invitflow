# ADR 0002 — Propriété des données par service

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — observé**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Chaque domaine possède son Prisma et sa base/credential.

## Conséquences

Réduit le couplage runtime, impose cohérence par événements et complique opérations/reporting.

## Sources

`services/*/prisma/schema.prisma`, provisioning postgres.
