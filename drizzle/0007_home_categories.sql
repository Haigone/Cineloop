ALTER TABLE "preferences" ADD COLUMN "home_category" text DEFAULT 'series' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "home_backgrounds" jsonb DEFAULT '{}'::jsonb NOT NULL;