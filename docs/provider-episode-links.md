# Provider episode links

`provider_title_links` continues to map a provider content ID to a CineLoop catalog title.
`episode_links` stores only verified episode references, keeping the database small.

## Storage rules

- Store one `link_type = 'anchor'` row per provider, CineLoop title, and season.
- The anchor can point to any known episode, not necessarily episode 1. Record its local season and episode numbers and the provider's exact ID in `external_id`.
- `id_step` is nullable. Set it to `1` only after verifying that provider IDs advance by one within that season; leave it null when the sequence has not been checked. Never carry an inferred sequence across a season boundary.
- Store only verified non-linear IDs as `link_type = 'exact'` rows. An exact row overrides arithmetic inference for that episode.
- The unique partial index prevents two anchors for the same provider/title/season. The primary key prevents duplicate rows for the same episode coordinate.
- `external_id` stays text so IDs that are not numeric are not coerced or damaged.

## Resolution rules for application code

1. Look for an exact episode row first.
2. Otherwise find the anchor for the same provider, title, and season.
3. Infer an ID only when the anchor has a verified `id_step` and both IDs are numeric. Use `anchorExternalId + (targetEpisode - anchorEpisode) * id_step`.
4. If no verified inference is possible, return no inferred ID and resolve the provider page normally.
5. On a season change, use that season's own anchor; never derive from the previous season.

This migration creates the storage schema only. It intentionally does not fabricate or backfill provider IDs: AnimeUnity and StreamingCommunity IDs must be observed and verified from actual provider pages before rows can be safely populated.
