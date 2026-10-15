ALTER TABLE "payment_orders" ADD COLUMN "checkin_events" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_orders" ADD COLUMN "checkin_guest_capacity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_checkin_values" CHECK ("checkin_events" >= 0 AND "checkin_guest_capacity" >= 0);
