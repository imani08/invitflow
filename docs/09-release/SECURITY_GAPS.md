# Écarts et contrôles sécurité — revue statique

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **OPEN ITEMS**

## Non évalué / ouvert

- Aucun audit de pénétration, SAST/DAST complet ou test de charge n’a été réalisé par cette passe.
- La posture effective TLS, pare-feu, segmentation, IAM cloud, KMS, ACL MinIO, rotation secret et rétention dépend du déploiement et n’est pas déduite du code.
- La couverture exhaustive des autorisations et accès cross-tenant exige une revue route par route et tests adversariaux.
- Vérifier CORS, CSP, cookies/session, rate limits et journaux depuis environnement réel.
- FlexPay/EasyPay et remboursements doivent suivre les contrats et preuves de callback vérifiés; pas de bypass frontend.
- Les documents juridiques doivent être validés par conseil compétent.

## Contrôles présents observés

OIDC/PKCE, vérification email côté callback, protection CSRF/state/nonce, guards bearer/roles, accès par propriétaire dans des handlers, ledger append-only, contraintes uniques/idempotence, upload quarantiné/scan, HMAC QR et audit sont visibles dans le code. Leur présence ne certifie pas l’absence de vulnérabilité.

Prioriser: tests d’IDOR/tenant, vérification signature IPN et replay, fuzz parser fichiers, scan dépendances/containers, session/cookie review, pentest indépendant, DR rehearsal, tests d’alertes et revue de secrets.
