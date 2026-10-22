CREATE TABLE IF NOT EXISTS friend_requests (
  id text PRIMARY KEY,
  from_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_not_self CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_to_status_idx ON friend_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_from_status_idx ON friend_requests(from_user_id, status);
CREATE TABLE IF NOT EXISTS watch_party_invitations (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  host_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_party_invites_not_host CHECK (host_id <> user_id),
  CONSTRAINT watch_party_invites_party_user_unique UNIQUE (party_id, user_id)
);
CREATE INDEX IF NOT EXISTS watch_party_invites_user_status_idx ON watch_party_invitations(user_id, status);
CREATE INDEX IF NOT EXISTS watch_party_invites_host_status_idx ON watch_party_invitations(host_id, status);
