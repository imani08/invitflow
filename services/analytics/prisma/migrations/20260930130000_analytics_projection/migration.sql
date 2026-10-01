CREATE TABLE "processed_events" (
    "event_id" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

CREATE TABLE "daily_metrics" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "metric" VARCHAR(80) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT '',
    "count" BIGINT NOT NULL DEFAULT 0,
    "value_minor" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_metrics_day_metric_currency_key"
ON "daily_metrics"("day", "metric", "currency");
CREATE INDEX "daily_metrics_metric_day_idx"
ON "daily_metrics"("metric", "day" DESC);
