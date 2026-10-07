# Propriété des bases

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Chaque domaine actif a sa base Prisma et des credentials de service distincts; le provisioning est dans `infrastructure/postgres/` et `compose.yaml`. Domaines détectés : profile, events, guests, seating, designs, media, ai-design, billing, payments, wallet, notifications, invitations, audit, analytics et access. Les modèles générés ne doivent pas remplacer le schéma Prisma comme source éditable.

Pas de jointure SQL distribuée : les services échangent des identifiants et des événements/contrats. Cela impose des contrôles ownership dans chaque service et rend les suppressions cohérentes multi-service un sujet opérationnel.

La présence d’une migration n’indique pas son application dans une base existante. Avant un déploiement, inspecter `prisma migrate status` par service avec la DB correcte.
