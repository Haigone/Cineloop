-- "Da vedere" is gone from the library: the wishlist is where plans live.
-- Planned titles move to the end of each user's wishlist, oldest first.
INSERT INTO "wishlist_items" ("user_id", "title_id", "added_at", "position", "suggested_by")
SELECT l."user_id", l."title_id", l."added_at",
  coalesce((SELECT max(w."position") FROM "wishlist_items" w WHERE w."user_id" = l."user_id"), -1)
    + row_number() OVER (PARTITION BY l."user_id" ORDER BY l."added_at"),
  NULL
FROM "library_entries" l
WHERE l."status" = 'planned'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- A planned title with a rating was evidently seen.
UPDATE "library_entries" SET "status" = 'completed' WHERE "status" = 'planned' AND "rating" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "library_entries" WHERE "status" = 'planned';
