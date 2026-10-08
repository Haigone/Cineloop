CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"season" integer,
	"episode" integer,
	"rating" smallint
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_a_user_b_pk" PRIMARY KEY("user_a","user_b"),
	CONSTRAINT "ordered_pair" CHECK ("friendships"."user_a" < "friendships"."user_b")
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"user_id" text NOT NULL,
	"title_id" text NOT NULL,
	"status" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"last_watched_at" timestamp with time zone,
	"rating" smallint,
	"progress" jsonb,
	CONSTRAINT "library_entries_user_id_title_id_pk" PRIMARY KEY("user_id","title_id"),
	CONSTRAINT "rating_range" CHECK ("library_entries"."rating" is null or "library_entries"."rating" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"href" text,
	"at" timestamp with time zone NOT NULL,
	"read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"profile_visibility" text DEFAULT 'friends' NOT NULL,
	"share_activity" boolean DEFAULT true NOT NULL,
	"notify_friend_activity" boolean DEFAULT true NOT NULL,
	"notify_watch_party" boolean DEFAULT true NOT NULL,
	"notify_suggestions" boolean DEFAULT true NOT NULL,
	"reduce_motion" boolean DEFAULT false NOT NULL,
	"subscriptions" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"search_key" text NOT NULL,
	"year" integer NOT NULL,
	"genres" text[] NOT NULL,
	"overview" text NOT NULL,
	"community_rating" real,
	"poster_url" text,
	"backdrop_url" text,
	"palette" text[] NOT NULL,
	"providers" text[] NOT NULL,
	"runtime_minutes" integer,
	"episode_runtime_minutes" integer,
	"seasons" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "watch_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watch_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"title_id" text NOT NULL,
	"watched_at" timestamp with time zone NOT NULL,
	"minutes" integer NOT NULL,
	"season" integer,
	"episode" integer
);
--> statement-breakpoint
CREATE TABLE "watch_parties" (
	"id" text PRIMARY KEY NOT NULL,
	"host_id" text NOT NULL,
	"participant_ids" text[] NOT NULL,
	"filter" text NOT NULL,
	"genre" text,
	"candidate_title_ids" text[] NOT NULL,
	"picked_title_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"user_id" text NOT NULL,
	"title_id" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"position" integer NOT NULL,
	"suggested_by" text,
	CONSTRAINT "wishlist_items_user_id_title_id_pk" PRIMARY KEY("user_id","title_id")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_a_users_id_fk" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_b_users_id_fk" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_parties" ADD CONSTRAINT "watch_parties_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_parties" ADD CONSTRAINT "watch_parties_picked_title_id_titles_id_fk" FOREIGN KEY ("picked_title_id") REFERENCES "public"."titles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_suggested_by_users_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_time_idx" ON "activity" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "friendships_b_idx" ON "friendships" USING btree ("user_b");--> statement-breakpoint
CREATE INDEX "notifications_user_time_idx" ON "notifications" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "titles_search_key_idx" ON "titles" USING btree ("search_key");--> statement-breakpoint
CREATE INDEX "watch_events_user_time_idx" ON "watch_events" USING btree ("user_id","watched_at");--> statement-breakpoint
CREATE INDEX "watch_parties_host_idx" ON "watch_parties" USING btree ("host_id","created_at");--> statement-breakpoint
CREATE INDEX "wishlist_user_position_idx" ON "wishlist_items" USING btree ("user_id","position");