# ADR 0001 — Monorepo pnpm et Turborepo

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — observé**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Conserver les apps, packages et services dans un workspace pnpm piloté par Turbo.

## Conséquences

Build/test partagés et types/versionnement cohérents au prix d’un scope checkout plus large.

## Sources

README, `pnpm-workspace.yaml`, `turbo.json`.
