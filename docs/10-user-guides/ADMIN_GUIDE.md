# Guide administrateur InvitaFlow

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

`apps/admin` expose la navigation vers les vues Web qui existent réellement. Les README source indiquent vues `/admin` support/modération, `/admin/pricing` finance pricing et `/admin/finance` paiements; audit/moderation requièrent Support/Super Admin ou Finance Admin selon route. Les contrôles exacts viennent controllers et UI, pas seulement le menu.

## Accès et tâches

1. Authentifiez un compte Keycloak doté du rôle spécifique; n’accordez pas Super Admin pour tester.
2. Support: ouvrir les vues d’audit/modération existantes, examiner l’état et enregistrer une décision autorisée.
3. Finance: consulter pricing schedules/paiements/anomalies selon rôle.
4. Les ajustements wallet passent par operations internes idempotentes et auditables, jamais SQL direct.
5. Avant agir sur payment provider, confirmer provider/ref/status server side; jamais copier secrets marchand dans notes.

Pas de gestion admin utilisateur/stockage/système complète prouvée par le shell admin seul. Captures non générées; voir `screenshots/README.md`.

[CAPTURE RÉELLE À AJOUTER — console modération/audit `/admin`]

Plan des seules pages admin présentes et checklist des rôles: [`SCREENSHOT_CHECKLIST.md`](SCREENSHOT_CHECKLIST.md). Chaque capture reste `NOT GENERATED` tant qu’elle n’a pas été prise sur runtime réel.
