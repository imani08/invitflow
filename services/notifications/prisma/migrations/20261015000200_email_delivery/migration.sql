CREATE TABLE "email_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notification_id" UUID,
  "recipient_email" VARCHAR(320) NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "text" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimed_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_deliveries_notification_id_key" UNIQUE ("notification_id")
);
CREATE INDEX "email_deliveries_pending_idx" ON "email_deliveries"("sent_at", "claimed_at", "created_at");
