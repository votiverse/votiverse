-- Migration 009: Introduce groups and capabilities
--
-- Groups are the user-facing top-level entity. The VCP assembly becomes an
-- internal implementation detail. This migration:
--   1. Creates groups, group_capabilities, group_members tables
--   2. Drops memberships (replaced by group_members)
--   3. Recreates invitations, join_requests, notifications, assets with group_id
--   4. Keeps assemblies_cache as a pure VCP config cache

-- ── New tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  handle          TEXT UNIQUE NOT NULL,
  avatar_style    TEXT NOT NULL DEFAULT 'initials',
  website_url     TEXT,
  admission_mode  TEXT NOT NULL DEFAULT 'approval'
                  CHECK (admission_mode IN ('open', 'approval', 'invite-only')),
  vote_creation   TEXT NOT NULL DEFAULT 'admin'
                  CHECK (vote_creation IN ('admin', 'members')),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  vcp_assembly_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS group_capabilities (
  group_id    UUID NOT NULL REFERENCES groups(id),
  capability  TEXT NOT NULL
              CHECK (capability IN ('voting', 'scoring', 'surveys', 'community_notes')),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, capability)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id       UUID NOT NULL REFERENCES groups(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  participant_id TEXT,
  role           TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner', 'admin', 'member')),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
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
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES groups(id),
  type           TEXT NOT NULL CHECK (type IN ('link', 'direct')),
  token          TEXT UNIQUE,
  invited_by     UUID NOT NULL REFERENCES users(id),
  invitee_handle TEXT,
  max_uses       INTEGER,
  use_count      INTEGER NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_group ON invitations(group_id);

CREATE TABLE IF NOT EXISTS invitation_acceptances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES invitations(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Join requests: assembly_id → group_id
DROP TABLE IF EXISTS join_requests;

CREATE TABLE IF NOT EXISTS join_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  user_name   TEXT NOT NULL,
  user_handle TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_join_requests_group ON join_requests(group_id);

-- Notifications: assembly_id → group_id
DROP TABLE IF EXISTS notifications;

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  group_id   UUID NOT NULL REFERENCES groups(id),
  type       TEXT NOT NULL,
  urgency    TEXT NOT NULL DEFAULT 'low',
  title      TEXT NOT NULL,
  body       TEXT,
  action_url TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(group_id);

-- Assets: assembly_id → group_id
DROP TABLE IF EXISTS assets;

CREATE TABLE IF NOT EXISTS assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  hash        TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data        BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_group ON assets(group_id);
