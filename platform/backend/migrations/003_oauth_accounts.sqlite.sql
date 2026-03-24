-- OAuth provider accounts (Google, Microsoft, etc.)
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  provider_user_id  TEXT NOT NULL,
  provider_email    TEXT,
  avatar_url        TEXT,
  raw_profile       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user
  ON oauth_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user
  ON oauth_accounts(user_id);
