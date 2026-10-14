ALTER TABLE "watch_parties" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "watch_parties" ADD COLUMN "scheduled_for" timestamp with time zone;