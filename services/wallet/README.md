# Wallet service

Phase 7 owner of `wallet_db`, available/reserved credit balances, reservation state and the immutable ledger. The balance row is a projection updated in the same PostgreSQL transaction as every ledger entry and outbox message. A database constraint prevents negative balances; a trigger rejects ledger updates/deletes. Corrections append a reversal entry.

## User API

All routes require a Keycloak token with the `wallet-api` audience and always scope data to its `sub` claim:

- `GET /v1/wallet/me` returns the actual available and reserved balance (a new account begins at zero).
- `GET /v1/wallet/me/transactions?limit=25&cursor=<entry-id>` returns reverse-chronological ledger entries.

## Internal API

These endpoints are intentionally absent from Gateway. Service callers must send `X-Service-Token: WALLET_INTERNAL_TOKEN` and an `Idempotency-Key` on every financial mutation:

- `POST /v1/internal/wallets/:ownerSubject/credits` with `{ "credits": 50, "type": "PURCHASE|PROMO|ADMIN_ADJUSTMENT", "referenceId": "..." }`.
- `POST /v1/internal/wallets/:ownerSubject/reservations` with `{ "credits": 50, "referenceId": "batch-id" }`.
- `POST /v1/internal/wallets/:ownerSubject/reservations/:referenceId/consume` or `/release`.
- `POST /v1/internal/wallets/:ownerSubject/entries/:entryId/reverse` for purchase/promo/adjustment credits.

Reservation state and balance deltas change atomically. Repeated reservation references, idempotency keys, consumption and release cannot double debit or credit. The dedicated `wallet.payment-events` consumer handles `payment.succeeded.v1` only after Payments publishes the provider-verified event. It writes one `PURCHASE` ledger entry with idempotency key `payment:<paymentId>:purchase`. A verified `payment.refunded.v1` appends the matching reversal with `payment:<paymentId>:refund`; an insufficient available balance is retried and then sent to `wallet.payment-events.dead` for finance review. Transient failures use 30-second retry queues. No free credit is granted automatically.
