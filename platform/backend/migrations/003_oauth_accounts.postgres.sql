-- OAuth provider accounts (Google, Microsoft, etc.)
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  provider_user_id  TEXT NOT NULL,
  provider_email    TEXT,
  avatar_url        TEXT,
  raw_profile       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user
  ON oauth_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user
  ON oauth_accounts(user_id);
