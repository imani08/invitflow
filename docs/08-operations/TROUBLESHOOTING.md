# Dépannage InvitaFlow

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

- **Compose démarre mais Web attend** : consulter jobs Keycloak/legal/email et DB-init, puis health des services dépendants; ne pas contourner une migration.
- **SMTP dev** : Mailpit par défaut; retrouver message sur port UI 8025. SMTP externe seulement après `MAIL_PROVIDER=smtp` explicite et credentials injectés.
- **Email login/session échoue** : audience email scope, `email`/`email_verified`, redirect URI, `email_verified=true`, state/PKCE et Keycloak event log sans tokens.
- **Import invités** : vérifier format colonne/mapping, job preview/commit et limites; ne pas réimporter un commit sans idempotency.
- **PDF pas prêt** : regarder InvitationBatch/BatchItem status, outbox `invitation.render.requested.v1`, queue worker, retries, stockage MinIO; télécharger seulement completed.
- **Wallet/credits** : consulter ledger et reservation ref, paiement success verified et idempotency. Ne jamais corriger solde en SQL.
- **Media non ready** : asset reste en quarantine tant que ClamAV/validation/transcode/publication inachevée.
- **Payment return success sans crédit** : retour navigateur ne crédite pas; inspecter statut serveur/provider, outbox et consumer Wallet.
