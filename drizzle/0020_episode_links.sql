CREATE TABLE "episode_links" (
  "provider_id" text NOT NULL,
  "title_id" text NOT NULL,
  "season_number" integer NOT NULL,
  "episode_number" integer NOT NULL,
  "external_id" text NOT NULL,
  "id_step" integer,
  "link_type" text DEFAULT 'anchor' NOT NULL,
  CONSTRAINT "episode_links_provider_id_title_id_season_number_episode_number_pk" PRIMARY KEY("provider_id","title_id","season_number","episode_number"),
  CONSTRAINT "episode_links_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "episode_links_positive_numbers" CHECK ("season_number" > 0 AND "episode_number" > 0),
  CONSTRAINT "episode_links_valid_step" CHECK ("id_step" IS NULL OR "id_step" <> 0),
  CONSTRAINT "episode_links_valid_type" CHECK ("link_type" IN ('anchor', 'exact'))
);
--> statement-breakpoint
CREATE INDEX "episode_links_title_provider_idx" ON "episode_links" USING btree ("title_id","provider_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "episode_links_one_anchor_per_season_idx" ON "episode_links" USING btree ("provider_id","title_id","season_number") WHERE "link_type" = 'anchor';
