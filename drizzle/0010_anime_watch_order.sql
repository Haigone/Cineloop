ALTER TABLE "library_entries" ADD COLUMN "part_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "watch_order" jsonb;