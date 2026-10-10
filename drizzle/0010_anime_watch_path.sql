CREATE TABLE "anime_watch_path" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "root_id" text NOT NULL,
  "anime_id" text NOT NULL,
  "included" boolean DEFAULT true NOT NULL,
  "watched" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "anime_watch_path_user_id_root_id_anime_id_pk" PRIMARY KEY("user_id", "root_id", "anime_id")
);
--> statement-breakpoint
CREATE INDEX "anime_watch_path_user_root_idx" ON "anime_watch_path" USING btree ("user_id", "root_id");
