# Payments service

Payments owns `payment_db`, immutable order snapshots, provider checkout attempts, verified provider notifications and the payment outbox. Orders are created from the active Billing catalog; the client submits only a pack ID. Price, currency, credits and schedule version are copied into the order before checkout.

## Providers

The business service depends on the `PaymentProvider` interface. `MockPaymentProvider` remains available for local development and uses the same transactional outbox and idempotent Wallet consumer. `FlexPayProvider` is registered as the new external provider. Refund, verification and reconciliation stay behind that abstraction.

The FlexPay RDC merchant API contract is not available in this repository. For that reason the adapter validates configuration but deliberately refuses checkout, callback verification, status checks and refunds until the official documentation and sandbox credentials are supplied. No API endpoint, authentication scheme, callback format, status mapping, payment method, currency rule or refund behavior is guessed. Keep `PAYMENT_PROVIDER=mock` for development.

When FlexPay is configured, the backend validates `FLEXPAY_ENV`, `FLEXPAY_BASE_URL`, `FLEXPAY_MERCHANT_CODE`, `FLEXPAY_AUTH_TOKEN`, `FLEXPAY_CALLBACK_URL` and `FLEXPAY_RETURN_URL`. Never expose the auth token to the browser. Placeholder values in `.env.example` are intentionally rejected when `PAYMENT_PROVIDER=flexpay`.

The `provider` column remains a string. Existing `CINETPAY` payment records are not rewritten and no database migration is needed. The retired CinetPay adapter can no longer verify or reconcile pending historical transactions; reconcile those against merchant records before retiring the prior integration.

## API

- `POST /v1/payments` with `Idempotency-Key` and `{ "packId": "..." }` creates or returns the caller's order and checkout attempt.
- `GET /v1/payments/me` lists only the caller's orders and payments.
- `GET /v1/payments/:paymentId` returns one caller-owned payment.
- `POST /v1/payments/:paymentId/mock-confirm` runs only for the mock provider outside production.
- `POST /v1/payments/webhooks/flexpay` is reserved for the future official callback contract and currently returns unavailable until that contract is implemented.
- `POST /v1/admin/payments/:paymentId/refund` is finance-admin-only; mock refunds are simulated in development. FlexPay refund requests are unavailable pending official API support.
- `GET /v1/admin/payments?provider=flexpay` gives Finance Admins a bounded, cursor-paginated provider-filtered transaction view. The `/admin/finance` page displays internal and provider references, order amounts and statuses without exposing provider credentials.
- `GET /v1/admin/reconciliation/issues` lists open finance anomalies.

Order snapshots are immutable at the database level. Provider transaction IDs and webhook receipts are unique. A verified success, order transition and `payment.succeeded.v1` outbox row commit in one database transaction. Checkout creation uses a database compare-and-set so concurrent requests cannot initialize multiple provider sessions for one order; a stale in-progress initialization can be retried. The Wallet consumer calls its own ledger with a payment-scoped idempotency key and uses delayed retry and dead-letter queues when delivery fails.

Real FlexPay reconciliation, refunds, invoices/PDF invoices, provider settlement imports and finance dashboards require provider-specific workflows. A provider refund must be verified before emitting `payment.refunded.v1`; reversing already-spent credits requires a separate finance decision.
