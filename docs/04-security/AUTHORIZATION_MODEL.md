# Modèle d’autorisation

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Identité principale: `sub` Keycloak comme owner subject. Token doit être signé par le realm attendu, non expiré et porter audience appropriée; un email valide n’est pas preuve de vérification, `email_verified=true` est requis côté Web. `CUSTOMER` est rôle initial annoncé dans realm export; rôles finance/support/admin/super-admin gouvernent opérations privilégiées.

Gateway ne remplace pas authorization métier. Chaque handler/service doit vérifier relation du sujet au `eventId`, asset, batch, design ou paiement. Les endpoints internes doivent rester privés réseau et exiger service token. Les routes publiques n’acceptent que les données publiées par token invitation.

Matrice détaillée: routes `services/*/src/*controller.ts`, guards `identity.guard.ts` et `internal.guard.ts`, rôle policies, Gateway allow routes. Test de non-accès A→B requis avant release.
