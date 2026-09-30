CREATE TYPE "WalletEntryType" AS ENUM ('PURCHASE', 'PROMO', 'ADMIN_ADJUSTMENT', 'RESERVATION', 'CONSUMPTION', 'RELEASE', 'REVERSAL');
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

CREATE TABLE "wallets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "available_credits" INTEGER NOT NULL DEFAULT 0,
  "reserved_credits" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallets_owner_subject_key" UNIQUE ("owner_subject"),
  CONSTRAINT "wallets_nonnegative_balances" CHECK ("available_credits" >= 0 AND "reserved_credits" >= 0)
);

CREATE TABLE "wallet_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "wallet_id" UUID NOT NULL,
  "type" "WalletEntryType" NOT NULL,
  "available_delta" INTEGER NOT NULL,
  "reserved_delta" INTEGER NOT NULL,
  "reference_type" VARCHAR(80),
  "reference_id" VARCHAR(255),
  "idempotency_key" VARCHAR(255) NOT NULL,
  "reversal_of_entry_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_entries_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "wallet_entries_reversal_of_entry_id_key" UNIQUE ("reversal_of_entry_id"),
  CONSTRAINT "wallet_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "wallet_entries_reversal_fkey" FOREIGN KEY ("reversal_of_entry_id") REFERENCES "wallet_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "wallet_entries_nonzero_delta" CHECK ("available_delta" <> 0 OR "reserved_delta" <> 0)
);
CREATE INDEX "wallet_entries_wallet_created_idx" ON "wallet_entries"("wallet_id", "created_at" DESC);
CREATE INDEX "wallet_entries_reference_idx" ON "wallet_entries"("reference_type", "reference_id");

CREATE FUNCTION reject_wallet_entry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet ledger entries are immutable; append a reversal instead';
END;
$$;
CREATE TRIGGER "wallet_entries_immutable" BEFORE UPDATE OR DELETE ON "wallet_entries" FOR EACH ROW EXECUTE FUNCTION reject_wallet_entry_mutation();

CREATE TABLE "wallet_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "wallet_id" UUID NOT NULL,
  "reference_id" VARCHAR(255) NOT NULL,
  "credits" INTEGER NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "idempotency_key" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "wallet_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_reservations_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "wallet_reservations_wallet_reference_key" UNIQUE ("wallet_id", "reference_id"),
  CONSTRAINT "wallet_reservations_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "wallet_reservations_positive_credits" CHECK ("credits" > 0)
);

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "wallet_outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wallet_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");
