CREATE TABLE IF NOT EXISTS provider_episode_links (
  provider_id text NOT NULL,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season integer NOT NULL,
  episode integer NOT NULL,
  external_episode_id text NOT NULL,
  url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, title_id, season, episode)
);
