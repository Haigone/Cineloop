ALTER TABLE "preferences" ADD COLUMN IF NOT EXISTS "provider_consent" jsonb DEFAULT '{}'::jsonb NOT NULL;
