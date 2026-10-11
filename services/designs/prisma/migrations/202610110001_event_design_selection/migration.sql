CREATE TABLE "event_design_selections" (
  "event_id" UUID NOT NULL,
  "owner_subject" VARCHAR(255) NOT NULL,
  "design_id" UUID NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("event_id", "owner_subject"),
  FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE CASCADE
);
