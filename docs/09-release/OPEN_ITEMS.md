# Registre de travail ouvert

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **OPEN ITEMS**

1. **P0 — Exploitation**: confirmer configuration SMTP, DNS/DMARC/TLS, sauvegarde chiffrée hors hôte, restore exercé et alertes on-call.
2. **P0 — Paiements**: obtenir contrat officiel fournisseur RDC et clés sandbox; vérifier signature, retries, reconciliation, refund et rapprochement avant activation.
3. **P0 — Sécurité**: revue systématique ownership/tenant; session config et stockage; scan dépendances/images; test intrusion externe.
4. **P1 — Identité**: parcours réel nouvelle inscription, vérification email, email_verified ID token, reset, expiration et révocation de session.
5. **P1 — Documents**: générer captures après environnement authentifié et vérifier mobile/desktop sur navigateurs réels.
6. **P1 — Agence/partenaire**: définir permissions, conditions commerciales, payout/reconciliation et UX avant annoncer les fonctions.
7. **P1 — Fiabilité**: tester queue DLQ, outbox retries, fichiers volumineux/corrompus, worker crash/reprise.
8. **P2 — Qualité**: audit accessibilité et contraste dans les pages finales, notamment tableaux/badges/états vides.
9. **P2 — SLO**: fixer seuils perf/disponibilité, capacité, RTO/RPO, rétention et responsables avant engagement.

Ce registre décrit des actions recommandées à partir d’une lecture statique; les priorités doivent être réévaluées par les responsables.
