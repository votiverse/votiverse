-- Migration 005: Groups refactor — nullable config, unified stances, role cleanup
--
-- Changes:
--   1. Make assemblies.config nullable (support scoring/survey-only groups)
--   2. Create unified stances table (replaces proposal_endorsements,
--      entity_endorsements, and note_evaluations)
--   3. Drop assembly_roles (roles now enforced by the backend)
--      RoleGranted/RoleRevoked events remain in the event log as audit trail.

-- ── 1. Make assemblies.config nullable ────────────────────────────────────────
-- SQLite cannot ALTER COLUMN constraints, so we recreate the table.

CREATE TABLE IF NOT EXISTS assemblies_new (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  name            TEXT NOT NULL,
  config          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  status          TEXT NOT NULL DEFAULT 'active'
);

INSERT INTO assemblies_new (id, organization_id, name, config, created_at, status)
  SELECT id, organization_id, name, config, created_at, status FROM assemblies;

DROP TABLE assemblies;
ALTER TABLE assemblies_new RENAME TO assemblies;

-- ── 2. Unified stances table ──────────────────────────────────────────────────
-- Replaces three separate tables with the same pattern:
--   proposal_endorsements (proposal × participant → endorse/dispute)
--   entity_endorsements   (candidacy/proposal × participant → endorse/dispute)
--   note_evaluations      (note × participant → endorse/dispute)
--
-- The stance primitive: one stance per member per entity, upsert semantics,
-- aggregate counts are authoritative. Event sourced via StanceSet/StanceCleared.

CREATE TABLE IF NOT EXISTS stances (
  assembly_id    TEXT NOT NULL,
  entity_type    TEXT NOT NULL
                 CHECK (entity_type IN ('proposal', 'candidacy', 'community_note', 'prediction')),
  entity_id      TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  value          TEXT NOT NULL
                 CHECK (value IN ('endorse', 'dispute', 'helpful', 'not_helpful')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (assembly_id, entity_type, entity_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_stances_entity
  ON stances(assembly_id, entity_type, entity_id);

-- Migrate existing data from the three legacy tables into stances

-- proposal_endorsements → stances (entity_type = 'proposal')
INSERT OR IGNORE INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
  SELECT assembly_id, 'proposal', proposal_id, participant_id, evaluation, evaluated_at, evaluated_at
  FROM proposal_endorsements;

-- entity_endorsements → stances (preserves target_type as entity_type)
INSERT OR IGNORE INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
  SELECT assembly_id, target_type, target_id, participant_id, value, created_at, updated_at
  FROM entity_endorsements;

-- note_evaluations → stances (entity_type = 'community_note')
INSERT OR IGNORE INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
  SELECT assembly_id, 'community_note', note_id, participant_id, evaluation, evaluated_at, evaluated_at
  FROM note_evaluations;

-- Drop legacy tables
DROP TABLE IF EXISTS proposal_endorsements;
DROP TABLE IF EXISTS entity_endorsements;
DROP TABLE IF EXISTS note_evaluations;

-- ── 3. Drop assembly_roles ────────────────────────────────────────────────────
-- Roles are now enforced by the backend's group_members table.
-- RoleGranted/RoleRevoked events remain in the events table as audit trail.

DROP TABLE IF EXISTS assembly_roles;
