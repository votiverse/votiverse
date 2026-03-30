-- Migration 009: Introduce groups and capabilities
--
-- Groups are the user-facing top-level entity. The VCP assembly becomes an
-- internal implementation detail. This migration:
--   1. Creates groups, group_capabilities, group_members tables
--   2. Drops memberships (replaced by group_members)
--   3. Recreates invitations, join_requests, notifications, assets with group_id
--   4. Keeps assemblies_cache as a pure VCP config cache (assembly-scoped data stays)

-- ── New tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS groups (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  handle          TEXT UNIQUE NOT NULL,
  avatar_style    TEXT NOT NULL DEFAULT 'initials',
  website_url     TEXT,
  admission_mode  TEXT NOT NULL DEFAULT 'approval'
                  CHECK (admission_mode IN ('open', 'approval', 'invite-only')),
  vote_creation   TEXT NOT NULL DEFAULT 'admin'
                  CHECK (vote_creation IN ('admin', 'members')),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  vcp_assembly_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS group_capabilities (
  group_id    TEXT NOT NULL REFERENCES groups(id),
  capability  TEXT NOT NULL
              CHECK (capability IN ('voting', 'scoring', 'surveys', 'community_notes')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  enabled_at  TEXT NOT NULL DEFAULT (datetime('now')),
  disabled_at TEXT,
  PRIMARY KEY (group_id, capability)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id       TEXT NOT NULL REFERENCES groups(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  participant_id TEXT,
  role           TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner', 'admin', 'member')),
  joined_at      TEXT NOT NULL DEFAULT (datetime('now')),
  title          TEXT,
  avatar_url     TEXT,
  banner_url     TEXT,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

-- ── Drop old memberships (replaced by group_members) ──────────────────────────

DROP TABLE IF EXISTS memberships;

-- ── Recreate group-scoped tables with group_id ────────────────────────────────

-- Invitations: assembly_id → group_id
DROP TABLE IF EXISTS invitation_acceptances;
DROP TABLE IF EXISTS invitations;

CREATE TABLE IF NOT EXISTS invitations (
  id             TEXT PRIMARY KEY,
  group_id       TEXT NOT NULL REFERENCES groups(id),
  type           TEXT NOT NULL CHECK (type IN ('link', 'direct')),
  token          TEXT UNIQUE,
  invited_by     TEXT NOT NULL REFERENCES users(id),
  invitee_handle TEXT,
  max_uses       INTEGER,
  use_count      INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_group ON invitations(group_id);

CREATE TABLE IF NOT EXISTS invitation_acceptances (
  id            TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL REFERENCES invitations(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  accepted_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Join requests: assembly_id → group_id
DROP TABLE IF EXISTS join_requests;

CREATE TABLE IF NOT EXISTS join_requests (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  user_name   TEXT NOT NULL,
  user_handle TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_join_requests_group ON join_requests(group_id);

-- Notifications: assembly_id → group_id
DROP TABLE IF EXISTS notifications;

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  group_id   TEXT NOT NULL REFERENCES groups(id),
  type       TEXT NOT NULL,
  urgency    TEXT NOT NULL DEFAULT 'low',
  title      TEXT NOT NULL,
  body       TEXT,
  action_url TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(group_id);

-- Assets: assembly_id → group_id
DROP TABLE IF EXISTS assets;

CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id),
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  hash        TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  data        BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_group ON assets(group_id);

-- ── assemblies_cache stays as-is ──────────────────────────────────────────────
-- It remains a pure VCP config cache. Group metadata (name, admission_mode,
-- website_url, vote_creation) now lives in the groups table. The cache is still
-- useful for quickly resolving VCP assembly config without a round-trip.
-- Mutable columns (admission_mode, website_url, vote_creation) on assemblies_cache
-- are no longer authoritative — the groups table is the source of truth.
