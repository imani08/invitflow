ALTER TABLE "agency_subscriptions" ADD COLUMN "checkin_event_limit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "agency_subscriptions" ADD COLUMN "checkin_guest_capacity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "agency_subscriptions" ADD CONSTRAINT "agency_subscriptions_checkin_values" CHECK ("checkin_event_limit" >= 0 AND "checkin_guest_capacity" >= 0);

CREATE TABLE "agency_checkin_activations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "guest_capacity" INTEGER NOT NULL,
  "activated_by" VARCHAR(255) NOT NULL,
  "activated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_checkin_activations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_checkin_activations_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "agency_checkin_activations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_checkin_activations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "agency_checkin_activations_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "agency_subscriptions"("id") ON DELETE RESTRICT,
  CONSTRAINT "agency_checkin_activations_guest_capacity_check" CHECK ("guest_capacity" > 0)
);
CREATE INDEX "agency_checkin_activations_subscription_idx" ON "agency_checkin_activations"("workspace_id", "subscription_id");
