# Validation end-to-end

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **NOT VERIFIED**

État de référence : `docs/E2E_VALIDATION.md` historique. Sa matrice signale runtime Docker indisponible, EasyPay sandbox absent et divers E2E NOT TESTED. Ce dossier d’ingénierie doit conserver la preuve (date, commit, runtime, comptes fictifs, logs sans PII, résultat) avant de reclasser une fonction.

Pour une campagne: créer deux comptes A/B, deux événements, importer petit XLSX fictif, placer invités, choisir design, rendre une invitation, RSVP, tester QR/check-in, valider wallet/pay provider sandbox seulement si activé, et refaire un accès croisé A→B. Ne pas réutiliser données client réelle.
