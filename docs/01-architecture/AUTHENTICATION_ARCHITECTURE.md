# Architecture d’authentification

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

1. Login construit Authorization Code OIDC avec `openid profile email`, state, nonce et challenge PKCE S256.
2. Keycloak authentifie l’utilisateur et applique les required actions (dont VERIFY_EMAIL selon le realm).
3. Le callback consomme le state, échange le code avec code_verifier, vérifie signature/issuer/audience/nonce/azp/subject et exige un email présent avec `email_verified === true`.
4. La session est chiffrée et conservée dans Redis; le navigateur reçoit seulement un cookie opaque HttpOnly/SameSite.
5. Les routes BFF utilisent l’access token serveur côté Gateway/services; refresh est coordonné.

PKCE, session et destination safe sont dans `apps/web/src/lib/auth-session.ts`; callback dans `apps/web/src/app/api/auth/callback/route.ts`; client/claims dans realm-export. Une exécution Keycloak/navigateur reste nécessaire pour démontrer un token réel.
