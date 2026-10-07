# Architecture des composants

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Le code partagé est volontairement réduit : `packages/contracts`, `packages/ui`, `packages/observability`, `packages/design-document`, `packages/legal-contract`. Les règles événement/invité/seating/design/paiement ne résident pas dans une bibliothèque commune, mais dans le service propriétaire.

Le frontend partage des composants et tokens de thème sémantiques pour préserver une identité InvitaFlow cohérente entre surfaces. La présence des tokens ne certifie pas le contraste de toutes les vues : thème clair/sombre reste à vérifier par audit visuel et mesures WCAG.

Gateway définit des contrôleurs proxy explicites, vérifie le format Bearer et transmet un contexte de corrélation. Les services revalident le token; les routes internes ont des guards séparés. Web BFF échange le code OIDC et conserve tokens chiffrés dans Redis.

Diagramme : `diagrams/sources/component-architecture.mmd`. Sources : `apps/gateway/src/main.ts`, `apps/web/src/lib/auth-session.ts`, `services/*/src/*module.ts`.
