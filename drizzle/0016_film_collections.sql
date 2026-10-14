CREATE TABLE "collection_choices" (
	"user_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"order" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_choices_user_id_collection_id_pk" PRIMARY KEY("user_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "collection_id" text;--> statement-breakpoint
ALTER TABLE "titles" ADD COLUMN "collection_name" text;--> statement-breakpoint
ALTER TABLE "collection_choices" ADD CONSTRAINT "collection_choices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;