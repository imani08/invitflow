# Architecture de rendu invitation

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Invitations capture un snapshot immuable de chaque invité, du design révisionné, de l’événement, des cérémonies et des données de placement. La demande passe par l’outbox vers une queue RabbitMQ durable. Le worker Rendering revendique les items et utilise le snapshot (pas les objets éditables) pour rendre un PDF A5, stocké privé dans MinIO. ZIP regroupe les résultats. Les états et retries restent enregistrés en DB pour reprise après worker.

Le lot réserve un crédit par invité, puis settle les réussites et relâche le reste selon le résultat. Détails et limitations : `services/invitations/README.md` et le schéma Invitations.
