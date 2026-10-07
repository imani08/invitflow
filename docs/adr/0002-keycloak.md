# ADR 0002 — Keycloak pour OIDC

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — code statique**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Utiliser Keycloak comme Identity Provider et le Web comme BFF OIDC/PKCE.

## Conséquences

Concentre identité et actions email; exige une configuration realm/client cohérente en runtime.

## Alternatives considérées

Le dépôt ne conserve pas de trace formelle des alternatives contemporaines. Cette ADR est rédigée rétrospectivement depuis le code; l’alternative à réévaluer lors d’une nouvelle revue est un choix plus centralisé ou plus simple à opérer. Ce paragraphe ne prétend pas établir qu’une telle analyse a été réalisée historiquement.

## Sources

realm export, client Web, callback BFF.

Le parcours Web emploie Authorization Code avec PKCE S256, `state`, `nonce`, validation issuer/audience et un scope OIDC incluant email. La présence de ces contrôles dans le code ne confirme pas un walkthrough runtime.
