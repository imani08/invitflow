# Règles métier présentes

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

- Chaque service métier possède son propre schéma et login DB. Les IDs propriétaires sont généralement des `ownerSubject` issus de l’identité vérifiée.
- La date d’un événement/cérémonie est stockée comme instant avec fuseau déclaré; Events valide l’offset ISO et sa cohérence avec la zone IANA. Zone par défaut à la création : `Africa/Kinshasa`.
- Les importations invités suivent une étape de parsing/mapping/validation avant commit; les erreurs et limites sont exposées comme données de job.
- Une invitation est produite depuis un instantané figé du design, événement, invité et placement; le rendu asynchrone ne lit pas des données modifiables en cours de génération.
- La génération réserve des crédits par invité, puis consomme les rendus réussis et relâche le reste selon résultat/annulation.
- Les crédits représentent une capacité d’utilisation. Un ledger append-only est la source comptable; les corrections passent par des entrées de reversal, jamais par suppression/édition.
- Un événement de paiement vérifié est une condition à l’octroi du pack; le client ne fournit pas le montant autoritaire.
- L’unicité RSVP est par invitation et cérémonie; l’entrée de check-in est protégée par l’unicité invitation/cérémonie.
- Une URL invitation/QR est signée HMAC et révocable; elle ne doit pas encoder contact ou notes d’invité.
- Acceptation CGU/confidentialité à l’inscription est un contrôle serveur et conserve versions et date UTC.

Sources : services Events, Guests, Invitations, Wallet, Payments et provider d’acceptation Keycloak.
