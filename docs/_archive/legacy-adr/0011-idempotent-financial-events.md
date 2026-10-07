# ADR 0011 — Événements financiers idempotents

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — tests ciblés à exécuter**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Références uniques/déduplication et contraintes protègent transitions.

## Conséquences

Tolère retry au prix de traitement des contradictions comme anomalies, jamais double crédit.

## Sources

Payments/Wallet handlers, contraintes Prisma.
