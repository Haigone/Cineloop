CREATE TABLE "saved_playlists" (
	"user_id" text NOT NULL,
	"playlist_id" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_playlists_user_id_playlist_id_pk" PRIMARY KEY("user_id","playlist_id")
);
--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_playlists" ADD CONSTRAINT "saved_playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_playlists" ADD CONSTRAINT "saved_playlists_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_playlists_playlist_idx" ON "saved_playlists" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "playlists_published_idx" ON "playlists" USING btree ("published_at");