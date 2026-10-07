# Gestion des migrations

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

Chaque service DB a `prisma/schema.prisma`, config et historique de migrations propre. Les migrations sont indépendantes; identité Keycloak a son propre DB/realm. Nouvelle image ne prouve pas que migration live est appliquée.

Avant déploiement: sauvegarde, `prisma migrate status` par service avec URL correcte, revue SQL et ordre dépendances; appliquer `migrate deploy` selon runbook contrôlé. Aucun `migrate reset` sur volume utilisateur. Vérifier version migration, health et données test.

Les migrations réellement présentes sont sous `services/<name>/prisma/migrations/`. Base vivante actuelle: NOT VERIFIED.
