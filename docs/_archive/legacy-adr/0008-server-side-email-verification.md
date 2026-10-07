# ADR 0008 — Vérification email côté IdP et callback

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — statique; e2e requis**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Keycloak force VERIFY_EMAIL; callback Web exige email vérifié.

## Conséquences

Identité mieux qualifiée; délivrabilité et token claims nécessitent vérification runtime.

## Sources

realm export, email provisioning, callback tests.
