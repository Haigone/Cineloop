CREATE TABLE "provider_season_links" (
  "provider_id" text NOT NULL,
  "title_id" text NOT NULL,
  "season_number" integer NOT NULL,
  "external_id" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "provider_season_links_provider_id_title_id_season_number_pk" PRIMARY KEY("provider_id","title_id","season_number"),
  CONSTRAINT "provider_season_links_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "provider_season_links_positive_season" CHECK ("season_number" > 0)
);
--> statement-breakpoint
CREATE INDEX "provider_season_links_title_provider_idx" ON "provider_season_links" USING btree ("title_id","provider_id");
