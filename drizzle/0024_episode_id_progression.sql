ALTER TABLE episode_links DROP CONSTRAINT IF EXISTS episode_links_valid_step;
--> statement-breakpoint
-- Recover a progression only when all adjacent exact observations agree.
UPDATE episode_links AS anchor
SET id_step = progression.step
FROM (
  SELECT
    reference.provider_id,
    reference.title_id,
    reference.season_number,
    reference.episode_number,
    MIN(
      (observed.external_id::bigint - reference.external_id::bigint)
      / (observed.episode_number - reference.episode_number)
    )::integer AS step
  FROM episode_links AS reference
  JOIN episode_links AS observed
    ON observed.provider_id = reference.provider_id
    AND observed.title_id = reference.title_id
    AND observed.season_number = reference.season_number
    AND observed.link_type = 'exact'
    AND abs(observed.episode_number - reference.episode_number) = 1
  WHERE reference.link_type = 'anchor'
    AND reference.external_id ~ '^[0-9]{1,12}$'
    AND observed.external_id ~ '^[0-9]{1,12}$'
  GROUP BY reference.provider_id, reference.title_id, reference.season_number, reference.episode_number
  HAVING COUNT(DISTINCT (
    (observed.external_id::bigint - reference.external_id::bigint)
    / (observed.episode_number - reference.episode_number)
  )) = 1
    AND MIN(
      (observed.external_id::bigint - reference.external_id::bigint)
      / (observed.episode_number - reference.episode_number)
    ) BETWEEN 1 AND 2147483647
) AS progression
WHERE anchor.provider_id = progression.provider_id
  AND anchor.title_id = progression.title_id
  AND anchor.season_number = progression.season_number
  AND anchor.episode_number = progression.episode_number;
--> statement-breakpoint
ALTER TABLE episode_links ADD CONSTRAINT episode_links_valid_step CHECK (id_step IS NULL OR id_step > 0);
