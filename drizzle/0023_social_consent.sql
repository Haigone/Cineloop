CREATE TABLE IF NOT EXISTS "friend_requests" (
  "requester_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("requester_id", "recipient_id"),
  CONSTRAINT "friend_requests_distinct_users" CHECK ("requester_id" <> "recipient_id")
);
CREATE INDEX IF NOT EXISTS "friend_requests_recipient_idx" ON "friend_requests" ("recipient_id", "requested_at");
ALTER TABLE "watch_parties"
  ADD COLUMN IF NOT EXISTS "pending_participant_ids" text[] NOT NULL DEFAULT '{}'::text[];
