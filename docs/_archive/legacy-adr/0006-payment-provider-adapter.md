# ADR 0006 — Adaptateur PaymentProvider

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — FlexPay réel reste bloqué**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Provider API abstraite et mock local plutôt que contrat spéculatif.

## Conséquences

Facilite tests; aucun provider live n’est déductible avant contrat marchand.

## Sources

README Payments et provider adapters.
