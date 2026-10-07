# ADR 0004 — Événements via RabbitMQ et transactional outbox

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — couverture par service varie**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Les domaines persistés publient les effets asynchrones depuis outbox quand présent.

## Conséquences

Évite dual-write; nécessite retry, DLQ, déduplication et observation.

## Sources

README services et modules outbox/consumers.
