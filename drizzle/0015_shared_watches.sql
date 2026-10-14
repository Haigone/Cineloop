CREATE TABLE "shared_watches" (
	"id" text PRIMARY KEY NOT NULL,
	"title_id" text NOT NULL,
	"host_id" text NOT NULL,
	"member_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "shared_watches" ADD CONSTRAINT "shared_watches_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_watches" ADD CONSTRAINT "shared_watches_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_watches" ADD CONSTRAINT "shared_watches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_watches_title_idx" ON "shared_watches" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "shared_watches_members_idx" ON "shared_watches" USING gin ("member_ids");