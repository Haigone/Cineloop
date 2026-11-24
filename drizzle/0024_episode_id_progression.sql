ALTER TABLE episode_links DROP CONSTRAINT IF EXISTS episode_links_valid_step;
--> statement-breakpoint
-- Recover the progression from adjacent exact episode IDs already stored.
UPDATE episode_links AS anchor
SET id_step = (
  (exact.external_id::bigint - anchor.external_id::bigint)
  / (exact.episode_number - anchor.episode_number)
)::integer
FROM episode_links AS exact
WHERE anchor.provider_id = exact.provider_id
  AND anchor.title_id = exact.title_id
  AND anchor.season_number = exact.season_number
  AND anchor.link_type = 'anchor'
  AND exact.link_type = 'exact'
  AND abs(exact.episode_number - anchor.episode_number) = 1
  AND anchor.external_id ~ '^[0-9]{1,12}$'
  AND exact.external_id ~ '^[0-9]{1,12}$'
  AND (exact.external_id::bigint - anchor.external_id::bigint)
      / (exact.episode_number - anchor.episode_number) BETWEEN 1 AND 2147483647;
--> statement-breakpoint
ALTER TABLE episode_links ADD CONSTRAINT episode_links_valid_step CHECK (id_step IS NULL OR id_step > 0);
