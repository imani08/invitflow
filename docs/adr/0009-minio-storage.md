# ADR 0009 — MinIO pour objets privés

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — code, runtime à valider**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Stocker médias et artefacts privés dans MinIO avec séparation quarantaine/ready quand applicable.

## Conséquences

Protège l’accès par contrôle et URL limitée; ACL et restore doivent être vérifiés en runtime.

## Alternatives considérées

Le dépôt ne conserve pas de trace formelle des alternatives contemporaines. Cette ADR est rédigée rétrospectivement depuis le code; l’alternative à réévaluer lors d’une nouvelle revue est un choix plus centralisé ou plus simple à opérer. Ce paragraphe ne prétend pas établir qu’une telle analyse a été réalisée historiquement.

## Sources

Media/Invitations et infrastructure MinIO.
