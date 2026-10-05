ALTER TABLE "payments"
ADD COLUMN "provider_order_ref" VARCHAR(16),
ADD COLUMN "provider_status" VARCHAR(80);

CREATE UNIQUE INDEX "payments_provider_order_ref_key"
ON "payments"("provider", "provider_order_ref");
