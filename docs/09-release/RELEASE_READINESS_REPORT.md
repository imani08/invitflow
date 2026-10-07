# Rapport de préparation release

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **BLOCKED**

**Conclusion : BLOCKED pour une déclaration de production prête** tant que les parcours runtime, paiement provider et restauration ne sont pas vérifiés.

| Domaine | Statut |
|---|---|
| Infrastructure | PARTIAL — Compose documenté, runtime dépendant |
| Auth / legal | PARTIAL — code config présent, walkthrough runtime requis |
| Email | PARTIAL — Mailpit/SMTP provision configurés; délivrabilité non testée |
| Events / guests / import / seating / design | PARTIAL — routes/tests présents, E2E cross-owner non attesté |
| Rendering / PDF / QR / RSVP / check-in | PARTIAL — service/tests/config présents, runtime non vérifié |
| Wallet | PARTIAL — ledger et tests présents, flux réel non testé |
| Payments / EasyPay | BLOCKED/NOT VERIFIED — fournisseur externe non qualifié |
| Storage / media | PARTIAL — code scanner/policies présents; runtime requis |
| Agency / partner | PARTIAL — schémas/routes; permissions/payout non E2E |
| Mobile / accessibility | NOT TESTED |
| Security | PARTIAL — contrôles code, tests adversariaux runtime manquants |
| Backups | BLOCKED — restore drill non effectué |
| Observability | PARTIAL — configuration, collecte/alerte réelle non vérifiée |
| Deployment / rollback | BLOCKED — stack local, runbook production final absent |

Sources : `docs/E2E_VALIDATION.md`, README services, CI et code actuel. La date de source de l’E2E peut être plus ancienne; revalider avant usage release.
