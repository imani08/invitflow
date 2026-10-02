ALTER TABLE "agency_quota_reservations" ADD COLUMN "subscription_id" UUID;
ALTER TABLE "agency_quota_reservations"
  ADD CONSTRAINT "agency_quota_reservations_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "agency_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "agency_quota_reservations_subscription_status_idx" ON "agency_quota_reservations"("subscription_id", "status");
