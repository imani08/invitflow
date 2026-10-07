# Guide des documents d’architecture

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

L’architecture repose sur le monorepo, le BFF, le Gateway, les services propriétaires, des bases séparées, une messagerie avec outbox et stockage objet privé. Diagrammes éditables et exports sont dans `diagrams/`. Chaque diagramme est un artefact autonome.

Les limites de disponibilité sont importantes : le Compose est local, plusieurs intégrations externes ne sont pas qualifiées, et `docs/E2E_VALIDATION.md` décrit une revue préproduction sans runtime.
