# ADR 0010 — Document de design versionné

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — code observé**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Représenter le design invitation comme document JSON versionné, distinct du rendu final.

## Conséquences

Sépare édition et artefact; compatibilité renderer et migration de schema à préserver.

## Alternatives considérées

Le dépôt ne conserve pas de trace formelle des alternatives contemporaines. Cette ADR est rédigée rétrospectivement depuis le code; l’alternative à réévaluer lors d’une nouvelle revue est un choix plus centralisé ou plus simple à opérer. Ce paragraphe ne prétend pas établir qu’une telle analyse a été réalisée historiquement.

## Sources

`packages/design-document` et services Designs/Rendering.
