# Architecture Keycloak

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Le realm export `invitaflow-dev` autorise inscription, login email, vérification et reset password, interdit emails dupliqués, sélectionne le login theme `invitaflow`, email theme `invitaflow`, et configure client public Web avec standard flow et PKCE S256. Client `invitaflow-web` a scopes `profile`, `email`, audiences API et rôles.

Le thème d’inscription montre l’acceptation légale; un FormAction serveur valide et enregistre les versions/time. `provision-legal-registration.mjs` lie le flow copié au realm; `provision-email.mjs` ajoute config SMTP/Mailpit et rend l’email requis. Les realms persistants ne sont pas écrasés par import : les jobs bootstrap configurent le realm au runtime Compose.

Secrets admin/SMTP restent server side. Aucun secret n’est décrit ici.
