# ADR 0010 — Mailpit par défaut en local

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — configuration à vérifier au déploiement**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Environnement local n’envoie pas d’emails externes sauf activation SMTP explicite.

## Conséquences

Sûr et reproductible; production nécessite configuration et tests de délivrabilité distincts.

## Sources

`.env.example`, Compose, provisioning email.
