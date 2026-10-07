# Modèle de menace STRIDE

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

| STRIDE / actif | Scénario | Contrôle observé | Risque résiduel / action |
|---|---|---|---|
| Spoofing / compte | voler code/session ou forger token | PKCE/state/nonce/JWKS; cookie opaque | tester fixation, replay, refresh et révocation en runtime |
| Tampering / event | utilisateur modifie ID d’un autre owner | ownerSubject guards | tests inter-comptes sur chaque domaine |
| Repudiation / paiement | contester callback ou crédit | outbox, références/idempotence, ledger append-only | audit complet et preuve marchand réel à valider |
| Information disclosure / invités | endpoint public fuite email/téléphone | projection publique minimisée, storage private | tests de réponses/routes directes et logs |
| Denial of service / média | fichier géant ou job IA sans fin | limites image, quotas AI, retries | charge/reverse proxy limits non mesurés |
| Elevation / admin | token mal audiencé ou rôle UI seul | guards Keycloak, audiences | tests rôle et endpoints directs |
| SSRF / image/provider | URL user atteinte depuis backend | politiques à examiner par feature | audit SSRF ciblé et allowlists |
| XSS / invitation | contenu événement injecté dans HTML/PDF | encodage template / snapshot | tests payload HTML/URL et rendu Chromium |
| Replay / QR/RSVP | token rejoué ou double scan | token HMAC, unicité de check-in par cérémonie | concurrency/API test; rotation HMAC invalide tous les liens |
| Malware / upload | fichier polyglotte/infecté | quarantine, clamd, decode/re-encode, private bucket | runtime test ClamAV et limites |
| Queue poison | message invalide retried | retry/DLX partiels | confirmer bindings et procédure DLQ par consumer |

Les contrôles et résiduels sont basés sur code/config observés; ce tableau ne constitue pas une certification ni une pentest.
