# Parcours acceptation légale

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Le contrat des versions est centralisé dans `packages/legal-contract/legal-manifest.json`. La page d’inscription expose les liens CGU/Confidentialité et contrôle client pour l’UX; la sécurité vient du FormAction provider qui exige la valeur `accepted` côté serveur. Le handler attache timestamps UTC et versions à l’utilisateur.

Attributs : `termsVersion`, `privacyVersion`, `termsAcceptedAt`, `privacyAcceptedAt`. Case unchecked par défaut; l’utilisateur doit cocher activement pour chaque nouvelle inscription. Les versions doivent être mises à jour selon le manifest et stratégie de migration.

Les documents légaux eux-mêmes sont des sources dans `apps/web/content/legal/`; leur conformité et exactitude nécessitent validation juridique par l’opérateur.
