# ADR 0005 — Objets privés pour médias et rendus

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Status: **ACCEPTED — code observé**

## Contexte

Le produit doit conserver un choix d’architecture explicite et traçable à partir du dépôt courant.

## Décision

MinIO buckets privés, upload staging/quarantaine et liens limités.

## Conséquences

Limite exposition accidentelle; ACL/presign/purge doivent être exercés en runtime.

## Sources

service Media, Invitations, infrastructure MinIO.
