# Modèle conceptuel des données

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Les données sont réparties en bases propriétaires; les clés d’identité externes sont stockées comme `ownerSubject`/références UUID et ne sont pas des relations SQL inter-services. Les domaines majeurs comprennent profil/suppression, événements/cérémonies/agence, invités/groupes/accès, seating, designs/versions, media, invitations/RSVP/check-in/batches, Billing, Payments/partners, Wallet ledger/reservations, notifications, audit et jobs AI.

Le diagramme `diagrams/sources/erd-high-level.mmd` est volontairement de haut niveau et ne prétend pas à un FK cross-database. Les champs exacts sont dans `DATA_DICTIONARY.md` généré à partir des schémas Prisma et dans chaque `services/<domain>/prisma/schema.prisma`.
