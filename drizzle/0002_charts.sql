CREATE TABLE "charts" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_events" ADD COLUMN "provider_id" text;--> statement-breakpoint
CREATE INDEX "watch_events_time_idx" ON "watch_events" USING btree ("watched_at");