# Gestion des secrets

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

`.env.example` contient des valeurs placeholder. `.env` est ignoré par Git. Secrets à fournir hors dépôt : mots de passe DB, Redis, Keycloak admin, `AUTH_SESSION_SECRET`, secrets MinIO/service tokens, `INVITATION_LINK_SECRET`, SMTP app password, API token marchand, credentials AI/provider et observability exporters.

Local Mailpit: `MAIL_PROVIDER=mailpit`, aucun secret SMTP requis. Test réel/production: définir explicitement `MAIL_PROVIDER=smtp` et identifiants SMTP. Provider payment reste mock local jusqu’au contrat externe qualifié; tokens FlexPay/EasyPay ne sont jamais `NEXT_PUBLIC` et ne doivent pas être journalisés.

Production devrait injecter depuis un gestionnaire de secrets, restreindre lecture aux containers nécessaires, éviter secrets dans arguments/process/logs, documenter rotation et révocation, séparer credentials dev/stage/prod. Le dépôt Compose actuel fait passer variables aux conteneurs; un coffre externe prod est une exigence de déploiement, pas déclarée implémentée.
