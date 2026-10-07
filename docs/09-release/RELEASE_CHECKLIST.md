# Liste de contrôle de release

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PLANNED**

- [ ] Scope et migrations relus par domaine; aucune migration destructive non approuvée.
- [ ] Secrets absents du Git; config correcte par environnement, SMTP explicitement smtp en production.
- [ ] CI lint/typecheck/tests/build verts pour commit taggé; versions images fixées.
- [ ] Bootstrap Keycloak/legal/email idempotent et scopes claims validés runtime.
- [ ] DB migration status et backup pris; procédure restore prête.
- [ ] Smoke auth verified email, user A/B ownership, event/import/design/render/pdf, RSVP/check-in.
- [ ] Paiement sandbox de contrat officiel ou provider Mock retiré de la production; webhooks idempotents/montant vérifié.
- [ ] Media ClamAV/MinIO buckets privés, object refs vérifiés.
- [ ] Alert rules et DLQ testées, contacts/escalade convenus.
- [ ] Mobile/clavier/contraste, guide capture réel et legal pages vérifiés.
- [ ] Rollback/communications et propriétaires confirmés.

Cocher avec preuve horodatée, pas par déclaration.
