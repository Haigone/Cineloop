ALTER TABLE episode_links DROP CONSTRAINT IF EXISTS episode_links_valid_step;
ALTER TABLE episode_links ADD CONSTRAINT episode_links_valid_step CHECK (id_step IS NULL OR id_step > 0);
