# ADR 0012 — Rendu invitations asynchrone

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — tests runtime non effectués**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

Créer des batches/jobs persistants puis PDF/ZIP par workers.

## Conséquences

UI répond vite et reprise possible; exige monitoring de file/températures et stockage privé.

## Sources

Invitations/Rendering README, consumers.
