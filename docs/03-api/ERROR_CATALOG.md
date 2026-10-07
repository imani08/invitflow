# Catalogue des erreurs API

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Les services Nest utilisent exceptions HTTP explicites, notamment erreurs de validation `400`, absence/invalidité de bearer `401`, refus rôle/ownership `403` ou réponse masquée `404`, ressource absente `404`, conflit/idempotence `409`, limite/quota `429`, intégration upstream indisponible `503`. Les formes JSON exactes diffèrent entre handlers/proxies; ne pas supposer un envelope global uniforme sans lire le contrôleur.

Gateway retourne certaines erreurs normalisées d’indisponibilité (ex. `profile_service_unavailable`). Les erreurs fournisseurs paiement ne doivent pas exposer tokens/provider bodies. Pour observabilité, corréler via `x-request-id` et `x-correlation-id` lorsque le chemin le préserve.

Références: `apps/gateway/src/main.ts`, contrôleurs et guards `services/*/src/`.
