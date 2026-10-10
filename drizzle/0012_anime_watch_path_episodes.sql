ALTER TABLE "anime_watch_path" ADD COLUMN "watched_episodes" jsonb NOT NULL DEFAULT '[]'::jsonb;
