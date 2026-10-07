# Liste de contrôle préparation production

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **NOT VERIFIED**

## Identité et Web

- [ ] Client/redirect URI de production exacts et scopes `openid profile email`; PKCE S256.
- [ ] Claims email/email_verified inclus; test inscription → vérification → callback réel.
- [ ] Cookies Secure/SameSite, HTTPS, CSP/CORS, retour d’URL interne uniquement.

## Mail et paiements

- [ ] Local Docker par défaut `MAIL_PROVIDER=mailpit`; SMTP réel explicite et secrets hors Git.
- [ ] SPF/DKIM/DMARC et délivrabilité de domaine vérifiés.
- [ ] Fournisseur RDC officiel et contrat marchand approuvés; sandbox/IPN/signature/refund/reconciliation testés avant paiement live.

## Données et reprise

- [ ] Migrations inspectées et appliquées par service avec plan de retour.
- [ ] Sauvegarde chiffrée, séparée du host, restore exercé.
- [ ] ACL privés MinIO, scan antivirus, rétention et suppression vérifiés.
- [ ] RabbitMQ durable, DLQ surveillée, outbox backlog visible; Redis limite/rôle documentés.

## Opérations

- [ ] TLS/secret manager, comptes minimaux, rotation et redaction logs.
- [ ] Health/readiness, alerting, on-call, corrélation et playbooks testés.
- [ ] Capacité/performance/accessibilité testées avec objectifs et appareil/navigateur consignés.
- [ ] Incident response, support, conformité juridique approuvés.

**État de cette passe: NOT VERIFIED.** Les cases ne sont pas cochées par simple présence documentaire.
