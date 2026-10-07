# ADR 0008 — Wallet en unités de crédit

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — code observé**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Traiter le solde comme des unités d’usage inscrites dans un ledger append-only; ce n’est pas de l’argent.

## Conséquences

Permet déduplication et audit; correction financière par opération compensatoire.

## Alternatives considérées

Le dépôt ne conserve pas de trace formelle des alternatives contemporaines. Cette ADR est rédigée rétrospectivement depuis le code; l’alternative à réévaluer lors d’une nouvelle revue est un choix plus centralisé ou plus simple à opérer. Ce paragraphe ne prétend pas établir qu’une telle analyse a été réalisée historiquement.

## Sources

Wallet schema/service et payment consumers.

L’entrée de crédit consommée depuis un succès paiement est dédupliquée; références et contraintes empêchent le double effet lors d’une livraison répétée. Les contradictions de statut relèvent d’une anomalie à rapprocher, pas d’une modification arbitraire du ledger.
