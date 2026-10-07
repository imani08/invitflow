# ADR 0001 — Architecture de services métier

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — architecture observée**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Séparer les capacités métier en services propriétaires avec routes/API dédiées.

## Conséquences

Permet déploiement et ownership par domaine, au prix de coordination, événements et observabilité distribuée.

## Alternatives considérées

Le dépôt ne conserve pas de trace formelle des alternatives contemporaines. Cette ADR est rédigée rétrospectivement depuis le code; l’alternative à réévaluer lors d’une nouvelle revue est un choix plus centralisé ou plus simple à opérer. Ce paragraphe ne prétend pas établir qu’une telle analyse a été réalisée historiquement.

## Sources

`services/*`, Gateway et monorepo.

## Décision de dépôt connexe

Le dépôt conserve aussi apps, packages et services dans un workspace pnpm orchestré par Turborepo (`pnpm-workspace.yaml`, `turbo.json`). Ce choix facilite partage de packages et tâches communes, avec un scope de checkout/build plus large; il est associé au découpage microservices, mais n’est pas le même choix architectural.
