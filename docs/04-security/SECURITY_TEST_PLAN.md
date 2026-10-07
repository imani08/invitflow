# Plan de tests sécurité

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PLANNED**

Priorités avant release:

1. AuthN: state/nonce incorrect/absent/rejoué, PKCE verifier mauvais, issuer/audience/azp invalide, expiration, email absent/non vérifié, refresh concurrent, logout/revocation.
2. Authorization A/B: tester accès direct event, guest, seating, design, asset, batch, invitation, paiement, wallet et admin avec un autre subject/role.
3. BFF/CSRF: cookies Secure/HttpOnly/SameSite, Origin, cross-site writes, cache/no-store.
4. Validation: JSON inattendu, pagination abusive, import ambigu/volumineux, IDs malformés, prompt, SVG/HTML, URL distantes.
5. Fichiers/SSRF: polyglot, archive expansion, MIME spoof, ClamAV timeout/infected, URL callback, bucket isolation.
6. Paiement: forged success, mauvais montant/devise/référence, duplicated/out-of-order IPN, concurrent browser-success/IPN, replay, mismatch et secret logs.
7. QR/RSVP/check-in: token altéré/expiré/révoqué, double RSVP/check-in concurrent, cérémonie non invitée.
8. Abuse/rate: login, email reset, création jobs/batches, upload, public endpoints.

Enregistrer environment/version, fixtures fictives, preuve/ID, expected/actual, résultat PASS/FAIL/BLOCKED/NOT TESTED. Ne pas faire de fuzz sur production sans autorisation.
