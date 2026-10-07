# ADR 0005 — Outbox transactionnelle et déduplication consommateur

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **PARTIAL — vérifier domaine par domaine**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Persister le message lié à l’état métier dans la transaction; dédupliquer l’effet côté consumer si mécanisme présent.

## Conséquences

Protège le dual-write et retries; patterns et couverture varient selon service.

## Alternatives considérées

Le dépôt ne conserve pas de trace formelle des alternatives contemporaines. Cette ADR est rédigée rétrospectivement depuis le code; l’alternative à réévaluer lors d’une nouvelle revue est un choix plus centralisé ou plus simple à opérer. Ce paragraphe ne prétend pas établir qu’une telle analyse a été réalisée historiquement.

## Sources

Outbox modules, tables et consumers.

Le pattern n’est pas uniforme: vérifier chaque producer et consumer. Le retry/DLX varie. Pour les événements financiers, déduplication et contraintes uniques côté Wallet protègent le crédit répété; pour les invitations, les batches/job persistés supportent une reprise bornée. Ces garanties ne remplacent pas les tests de panne en runtime.
