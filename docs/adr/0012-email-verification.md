# ADR 0012 — Vérification email obligatoire

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — tests E2E à faire**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Keycloak exige VERIFY_EMAIL et la session Web refuse un claim d’email non vérifié.

## Conséquences

Réduit comptes non qualifiés; dépend du bon scope ID token et délivrabilité réelle.

## Alternatives considérées

Le dépôt ne conserve pas de trace formelle des alternatives contemporaines. Cette ADR est rédigée rétrospectivement depuis le code; l’alternative à réévaluer lors d’une nouvelle revue est un choix plus centralisé ou plus simple à opérer. Ce paragraphe ne prétend pas établir qu’une telle analyse a été réalisée historiquement.

## Sources

Realm export, provisioning email, callback.

Pour le développement local, le provider email par défaut est Mailpit (`MAIL_PROVIDER=mailpit`); un test SMTP réel exige l’activation explicite de `MAIL_PROVIDER=smtp` et des secrets d’environnement. Ne jamais inscrire les valeurs secrètes dans le realm versionné.
