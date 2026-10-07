# Documentation technique InvitaFlow

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow

Corpus de référence construit depuis le dépôt local. Les documents marquent explicitement l’implémentation observée, partielle, planifiée ou non vérifiée. Une description de code ne certifie pas une disponibilité runtime.

## Navigation
### [00-product](./00-product/)

Vision, périmètre, SRS, exigences, règles métier.

### [01-architecture](./01-architecture/)

Architecture, C4, 32 diagrammes, ADR.

### [02-data](./02-data/)

ERD, ownership, dictionnaire Prisma, classification et cycle de vie.

### [03-api](./03-api/)

Guide/catalogue API, erreurs, événements, intégration.

### [04-security](./04-security/)

Sécurité, STRIDE, autorisations, secrets, incidents et tests.

### [05-payments](./05-payments/)

Providers, paiement, EasyPay/FlexPay état réel, Wallet et preuves.

### [06-auth-email](./06-auth-email/)

Keycloak, inscription, acceptation légale, email et SMTP.

### [07-testing](./07-testing/)

Stratégie, E2E, sécurité, performance, mobile, accessibilité.

### [08-operations](./08-operations/)

Runbook, deploy, migrations, sauvegarde, observabilité, readiness.

### [09-release](./09-release/)

ADR/audits, release, risques, rollback, open items.

### [10-user-guides](./10-user-guides/)

guides utilisateurs/admin/agence/partenaire et captures attendues.

### [11-legal](./11-legal/)

pointeurs vers le package juridique versionné.

## Artefacts

- [32 diagrammes source Mermaid et exports](01-architecture/DIAGRAM_CATALOG.md)
- [ADRs](adr/README.md)
- [Rapports d’audit](reports/)
- [Export DOCX (16 documents)](dist/docx/README.md)
- [Plan central des captures](10-user-guides/SCREENSHOT_CHECKLIST.md)
- [Guide utilisateur](10-user-guides/END_USER_GUIDE.md)
- [Archive historique](_archive/README.md)
- [Outillage de génération et validation](../tools/docs/README.md)

## Documentation status

SOURCE DOCUMENTATION: READY
DIAGRAM SOURCES: READY
PNG/SVG EXPORTS: GENERATED
MERMAID CLI VALIDATION: NOT VERIFIED
WORD EXPORTS: GENERATED
WORD STRUCTURAL VALIDATION: PASS
WORD VISUAL QA: NOT VERIFIED
END-USER SCREENSHOTS: NOT GENERATED
ADMIN SCREENSHOTS: NOT GENERATED
RUNTIME EVIDENCE: PENDING

Les diagrammes PNG/SVG sont des exports déterministes du générateur documentaire. Les fichiers Mermaid sont éditables; l’export ne remplace pas la validation par Mermaid CLI.

## Documents existants conservés

Les dossiers `docs/` antérieurs couvrent déjà parcours AI, design, expérience client, intégration historique EasyPay, validations E2E et opérations/sauvegarde. Ils demeurent référentiels complémentaires : [E2E historique](E2E_VALIDATION.md), [remaining work](REMAINING_WORK.md), [backup operations](OPERATIONS_BACKUPS.md), [AI customer journey](AI_CUSTOMER_JOURNEY.md), [AI design composer](AI_DESIGN_COMPOSER.md), [AI editorial assist](AI_EDITORIAL_ASSIST.md), [historique EasyPay](PAYMENTS_EASYPAY.md).

## Support

Exploitant propriétaire: FOCUS HD ENTREPRISES · `fucushd098@gmail.com` · `+243973431495`. Ne pas envoyer secrets ou données d’invités sur ce canal.
