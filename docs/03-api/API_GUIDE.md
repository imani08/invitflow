# Guide des API InvitaFlow

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Le point d’entrée applicatif est Gateway (`apps/gateway`), généralement consommé par le BFF Web. Les routes domaine utilisent `/v1/...`; routes internes wallet/service tokens et routes publiques d’invitation ne suivent pas toutes le même schéma d’authentification.

Les requêtes authentifiées portent un token Keycloak access token; chaque service vérifie signature, issuer, audience et identité. Endpoints publics RSVP lisent un token d’invitation signé et ne délivrent pas d’identité utilisateur. Les actions mutantes financièrement/async requièrent une `Idempotency-Key` lorsqu’implémentée.

Les décorateurs routes sont dans les `*.controller.ts`; le Gateway possède un mapping explicite `apps/gateway/src/main.ts`. Aucune spécification OpenAPI centralisée n’a été repérée dans l’inventaire; le catalogue suivant est donc volontairement par familles plutôt que doublon d’un contrat généré.
