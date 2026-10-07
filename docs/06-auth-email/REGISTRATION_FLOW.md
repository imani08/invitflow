# Parcours inscription

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

1. L’utilisateur choisit inscription Keycloak.
2. Le profil exige email valide et champs d’identité/password gérés par User Profile.
3. La case légale n’est pas précochée; liens `/legal/cgu` et `/legal/confidentialite` s’ouvrent séparément.
4. FormAction légal serveur refuse si case absente; après création utilisateur, persiste `termsVersion`, `privacyVersion`, `termsAcceptedAt`, `privacyAcceptedAt` depuis manifest/code.
5. Realm `verifyEmail` et action `VERIFY_EMAIL` conduisent à l’email vérification.
6. Session applicative n’est créée qu’au callback OIDC après claim email vérifié.

Diagrammes séparés `registration-legal-acceptance` et `email-verification`. Un walkthrough Keycloak reste à exécuter après build/runtime.
