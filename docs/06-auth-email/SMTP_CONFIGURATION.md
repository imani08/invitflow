# Configuration SMTP

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

| Mode | Paramétrage |
|---|---|
| Local | `MAIL_PROVIDER=mailpit`; SMTP interne `mailpit:1025`, aucune auth |
| Test avec email réel | `MAIL_PROVIDER=smtp`; identifiants SMTP dans secrets environment |
| Production | `MAIL_PROVIDER=smtp`; credentials et host/from validés par opérateur |

Variables: `KEYCLOAK_SMTP_HOST`, `KEYCLOAK_SMTP_PORT`, `KEYCLOAK_SMTP_FROM`, `KEYCLOAK_SMTP_FROM_DISPLAY_NAME`, `KEYCLOAK_SMTP_USER`, `KEYCLOAK_SMTP_PASSWORD`, `KEYCLOAK_SMTP_STARTTLS`, `KEYCLOAK_SMTP_SSL`. Pour l’option Gmail indiquée au dépôt : `smtp.gmail.com`, port 587, STARTTLS; mot de passe d’application, jamais mot de passe normal. `.env.example` laisse secret vide; `.env` est ignoré. Aucun mot de passe n’est consigné dans les logs.

Le service provision email valide mode/credential et applique réglages au realm. Ne jamais mettre secret dans JSON realm, front, documentation ou output console.
