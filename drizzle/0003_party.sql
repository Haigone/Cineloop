CREATE TABLE "parties" (
	"host_id" text PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "live_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;