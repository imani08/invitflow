# ADR 0003 — OIDC Authorization Code avec PKCE

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — code statique**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Le BFF Web gère le callback et la session via Keycloak.

## Conséquences

Réduit exposition des jetons; impose validation stricte state/nonce/issuer/audience/retour interne.

## Sources

`apps/web/src/lib/auth-session.ts`, Keycloak realm.
