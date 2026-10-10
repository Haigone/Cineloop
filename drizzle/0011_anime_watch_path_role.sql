ALTER TABLE "anime_watch_path" ADD COLUMN "role" text NOT NULL DEFAULT 'required';
--> statement-breakpoint
UPDATE "anime_watch_path" SET "role" = CASE WHEN "included" THEN 'required' ELSE 'skipped' END;
