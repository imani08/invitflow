# Vérification email

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

À la création, Keycloak ne doit pas déclarer l’adresse vérifiée seulement parce qu’elle passe le format : `emailVerified` reste faux et action `VERIFY_EMAIL` doit être requise lorsque `verifyEmail=true`. Keycloak envoie un lien one-time signé selon sa config d’expiration. Le lien vérifié met le compte à `emailVerified=true`. À l’authentification suivante, standard scope `email` mappe `email` et `emailVerified` vers claims ID token `email`, `email_verified`; le callback exige les deux.

Le mail local utilise Mailpit; test courrier réel/production nécessite `MAIL_PROVIDER=smtp`. Runtime séquentiel registration→email→verification→OIDC doit être validé. Diagramme `email-verification-sequence.mmd`.
