# Architecture de sécurité

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

## Identité et sessions

Keycloak est l’issuer OIDC. Le Web BFF utilise authorization code + PKCE S256, state/nonce, validation d’issuer/audience/azp et claim d’email vérifié. Redis conserve des tokens chiffrés; cookie opaque HttpOnly/SameSite et secure en production. Realm export active email verification, et l’email scope standard émet `email` et `email_verified`.

## Autorisation et frontières

Gateway exige un Bearer pour la plupart des proxys; les services refont validation et contrôle de propriétaire. Routes internes wallet ont `X-Service-Token` et idempotency; public invitation est scindé à un jeton signé minimisé. Les rôles Keycloak séparent client et admin. Le réseau Docker isole DB/broker/stockage, mais Compose n’est pas une politique réseau de production.

## Données et sécurité des fichiers

Médias écrivent d’abord en quarantaine; taille/MIME/magic bytes/dimensions/scanner ClamAV/décodage Sharp contrôlés avant publication prête. Bucket ready privé, URLs signées courte durée et scopes précis. PDF/ZIP invitations privés.

## Paiement et fraude

Montant/monnaie viennent du snapshot Billing côté serveur. Callback/webhook doit vérifier la preuve serveur et ses références avant transition/ledger. Idempotence, références uniques, outbox, ledger append-only et contrainte de solde sont des contrôles présents. Un fournisseur externe n’est pas qualifié sans contrat sandbox.

## Protections à vérifier

CSRF BFF, CSP, XSS dans rendu, SSRF, IDOR entre comptes, rate limiting, injection SQL/commandes, replay RSVP/QR, concurrence double check-in et paramètres proxy doivent rester dans plan de tests. Ne pas conclure « sécurisé » sur une simple revue statique. Liens : `THREAT_MODEL.md`, `SECURITY_TEST_PLAN.md`, guards, politiques MinIO, web CSP et payment providers.
