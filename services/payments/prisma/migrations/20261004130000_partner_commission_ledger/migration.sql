CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "PartnerAttributionStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "CommissionLedgerStatus" AS ENUM ('PENDING', 'VALIDATED', 'PAYABLE', 'PAID', 'REVERSED', 'DISPUTED');
CREATE TYPE "PartnerPayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED');

CREATE TABLE "partners" (
  "id" UUID NOT NULL,
  "owner_subject" VARCHAR(255),
  "code" VARCHAR(60) NOT NULL,
  "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
  "commission_rate_bps" INTEGER NOT NULL,
  "eligible_order_types" "PaymentOrderType"[] NOT NULL DEFAULT ARRAY[]::"PaymentOrderType"[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "partners_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partners_rate_bps_check" CHECK ("commission_rate_bps" BETWEEN 0 AND 10000)
);
CREATE UNIQUE INDEX "partners_owner_subject_key" ON "partners"("owner_subject");
CREATE UNIQUE INDEX "partners_code_key" ON "partners"("code");

CREATE TABLE "referral_attributions" (
  "id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "customer_subject" VARCHAR(255) NOT NULL,
  "source" VARCHAR(20) NOT NULL,
  "code_snapshot" VARCHAR(60) NOT NULL,
  "status" "PartnerAttributionStatus" NOT NULL DEFAULT 'ACTIVE',
  "attributed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_attributions_source_check" CHECK ("source" IN ('CODE', 'LINK', 'ORDER')),
  CONSTRAINT "referral_attributions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "referral_attributions_customer_subject_key" ON "referral_attributions"("customer_subject");
CREATE INDEX "referral_attributions_partner_idx" ON "referral_attributions"("partner_id", "status", "attributed_at" DESC);

CREATE TABLE "commission_ledger_entries" (
  "id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "attribution_id" UUID,
  "payment_id" UUID NOT NULL,
  "original_payment_id" UUID,
  "order_id" UUID NOT NULL,
  "original_entry_id" UUID,
  "status" "CommissionLedgerStatus" NOT NULL DEFAULT 'PENDING',
  "order_type" "PaymentOrderType" NOT NULL,
  "base_amount_minor" INTEGER NOT NULL,
  "commission_amount_minor" INTEGER NOT NULL,
  "rate_bps_snapshot" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_ledger_base_amount_check" CHECK ("base_amount_minor" >= 0),
  CONSTRAINT "commission_ledger_rate_check" CHECK ("rate_bps_snapshot" BETWEEN 0 AND 10000),
  CONSTRAINT "commission_ledger_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_ledger_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "referral_attributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_ledger_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_ledger_original_entry_id_fkey" FOREIGN KEY ("original_entry_id") REFERENCES "commission_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "commission_ledger_original_payment_key" ON "commission_ledger_entries"("original_payment_id");
CREATE UNIQUE INDEX "commission_ledger_reversal_original_key" ON "commission_ledger_entries"("original_entry_id");
CREATE INDEX "commission_ledger_partner_status_idx" ON "commission_ledger_entries"("partner_id", "status", "created_at" DESC);

CREATE TABLE "partner_payouts" (
  "id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "PartnerPayoutStatus" NOT NULL DEFAULT 'PENDING',
  "external_reference" VARCHAR(255),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "partner_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_payouts_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "partner_payouts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "partner_payouts_partner_created_idx" ON "partner_payouts"("partner_id", "created_at" DESC);

CREATE TABLE "partner_audit_entries" (
  "id" UUID NOT NULL,
  "partner_id" UUID NOT NULL,
  "actor_subject" VARCHAR(255) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_audit_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_audit_entries_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "partner_audit_partner_created_idx" ON "partner_audit_entries"("partner_id", "created_at" DESC);

CREATE TABLE "partner_payout_commissions" (
  "payout_id" UUID NOT NULL,
  "commission_entry_id" UUID NOT NULL,
  CONSTRAINT "partner_payout_commissions_pkey" PRIMARY KEY ("payout_id", "commission_entry_id"),
  CONSTRAINT "partner_payout_commissions_commission_entry_id_key" UNIQUE ("commission_entry_id"),
  CONSTRAINT "partner_payout_commissions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "partner_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "partner_payout_commissions_commission_entry_id_fkey" FOREIGN KEY ("commission_entry_id") REFERENCES "commission_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE FUNCTION prevent_commission_ledger_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.partner_id IS DISTINCT FROM NEW.partner_id OR OLD.attribution_id IS DISTINCT FROM NEW.attribution_id OR OLD.payment_id IS DISTINCT FROM NEW.payment_id OR OLD.original_payment_id IS DISTINCT FROM NEW.original_payment_id OR OLD.order_id IS DISTINCT FROM NEW.order_id OR OLD.original_entry_id IS DISTINCT FROM NEW.original_entry_id OR OLD.order_type IS DISTINCT FROM NEW.order_type OR OLD.base_amount_minor IS DISTINCT FROM NEW.base_amount_minor OR OLD.commission_amount_minor IS DISTINCT FROM NEW.commission_amount_minor OR OLD.rate_bps_snapshot IS DISTINCT FROM NEW.rate_bps_snapshot OR OLD.currency IS DISTINCT FROM NEW.currency OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Commission ledger financial fields are immutable';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status AND NOT ((OLD.status = 'PENDING' AND NEW.status IN ('VALIDATED', 'REVERSED', 'DISPUTED')) OR (OLD.status = 'VALIDATED' AND NEW.status IN ('PAYABLE', 'REVERSED', 'DISPUTED')) OR (OLD.status = 'PAYABLE' AND NEW.status IN ('PAID', 'REVERSED', 'DISPUTED')) OR (OLD.status = 'PAID' AND NEW.status = 'REVERSED') OR (OLD.status = 'DISPUTED' AND NEW.status IN ('VALIDATED', 'REVERSED'))) THEN
    RAISE EXCEPTION 'Invalid commission ledger status transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commission_ledger_immutable BEFORE UPDATE ON "commission_ledger_entries" FOR EACH ROW EXECUTE FUNCTION prevent_commission_ledger_change();
