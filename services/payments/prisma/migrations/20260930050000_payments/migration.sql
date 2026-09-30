CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED');
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAID', 'CANCELLED', 'REFUNDED');

CREATE TABLE "payment_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "pack_id" UUID NOT NULL,
  "pack_key" VARCHAR(60) NOT NULL,
  "pack_name" VARCHAR(100) NOT NULL,
  "credits" INTEGER NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "price_schedule_id" UUID NOT NULL,
  "price_schedule_version" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_orders_positive_credits" CHECK ("credits" > 0),
  CONSTRAINT "payment_orders_positive_amount" CHECK ("amount_minor" > 0),
  CONSTRAINT "payment_orders_owner_idempotency_key" UNIQUE ("owner_subject", "idempotency_key")
);
CREATE INDEX "payment_orders_owner_created_idx" ON "payment_orders"("owner_subject", "created_at" DESC);

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "checkout_url" VARCHAR(2048),
  "provider_transaction_id" VARCHAR(255),
  "provider_reference" VARCHAR(255),
  "provider_refund_id" VARCHAR(255),
  "failure_code" VARCHAR(100),
  "paid_at" TIMESTAMPTZ(3),
  "reconciliation_attempt_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "payments_provider_transaction_id_key" UNIQUE ("provider_transaction_id"),
  CONSTRAINT "payments_order_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "payments_status_reconciled_idx" ON "payments"("status", "reconciliation_attempt_at");

CREATE TABLE "payment_webhook_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(40) NOT NULL,
  "event_hash" CHAR(64) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_webhook_receipts_provider_hash_key" UNIQUE ("provider", "event_hash")
);
CREATE INDEX "payment_webhook_receipts_received_idx" ON "payment_webhook_receipts"("received_at");

CREATE TABLE "payment_reconciliation_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "internal_status" VARCHAR(40) NOT NULL,
  "provider_status" VARCHAR(80) NOT NULL,
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  "resolved_at" TIMESTAMPTZ(3),
  CONSTRAINT "payment_reconciliation_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reconciliation_issues_fingerprint_key" UNIQUE ("fingerprint"),
  CONSTRAINT "payment_reconciliation_issues_payment_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "payment_reconciliation_open_idx" ON "payment_reconciliation_issues"("resolved_at", "last_seen_at" DESC);
CREATE INDEX "payment_reconciliation_payment_idx" ON "payment_reconciliation_issues"("payment_id", "resolved_at");

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");

CREATE FUNCTION reject_payment_order_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."owner_subject" IS DISTINCT FROM OLD."owner_subject"
    OR NEW."pack_id" IS DISTINCT FROM OLD."pack_id"
    OR NEW."pack_key" IS DISTINCT FROM OLD."pack_key"
    OR NEW."pack_name" IS DISTINCT FROM OLD."pack_name"
    OR NEW."credits" IS DISTINCT FROM OLD."credits"
    OR NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."price_schedule_id" IS DISTINCT FROM OLD."price_schedule_id"
    OR NEW."price_schedule_version" IS DISTINCT FROM OLD."price_schedule_version"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'payment order snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "payment_orders_snapshot_immutable" BEFORE UPDATE ON "payment_orders" FOR EACH ROW EXECUTE FUNCTION reject_payment_order_snapshot_mutation();
