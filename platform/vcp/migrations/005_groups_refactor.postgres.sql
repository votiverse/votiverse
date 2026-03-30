-- Migration 005: Groups refactor — nullable config, unified stances, role cleanup
--
-- Changes:
--   1. Make assemblies.config nullable (support scoring/survey-only groups)
--   2. Create unified stances table (replaces proposal_endorsements,
--      entity_endorsements, and note_evaluations)
--   3. Drop assembly_roles (roles now enforced by the backend)

-- ── 1. Make assemblies.config nullable ────────────────────────────────────────

ALTER TABLE assemblies ALTER COLUMN config DROP NOT NULL;

-- ── 2. Unified stances table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stances (
  assembly_id    TEXT NOT NULL,
  entity_type    TEXT NOT NULL
                 CHECK (entity_type IN ('proposal', 'candidacy', 'community_note', 'prediction')),
  entity_id      TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  value          TEXT NOT NULL
                 CHECK (value IN ('endorse', 'dispute', 'helpful', 'not_helpful')),
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, entity_type, entity_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_stances_entity
  ON stances(assembly_id, entity_type, entity_id);

-- Migrate existing data

INSERT INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
  SELECT assembly_id, 'proposal', proposal_id, participant_id, evaluation, evaluated_at, evaluated_at
  FROM proposal_endorsements
  ON CONFLICT DO NOTHING;

INSERT INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
  SELECT assembly_id, target_type, target_id, participant_id, value, created_at, updated_at
  FROM entity_endorsements
  ON CONFLICT DO NOTHING;

INSERT INTO stances (assembly_id, entity_type, entity_id, participant_id, value, created_at, updated_at)
  SELECT assembly_id, 'community_note', note_id, participant_id, evaluation, evaluated_at, evaluated_at
  FROM note_evaluations
  ON CONFLICT DO NOTHING;

-- Drop legacy tables
DROP TABLE IF EXISTS proposal_endorsements;
DROP TABLE IF EXISTS entity_endorsements;
DROP TABLE IF EXISTS note_evaluations;

-- ── 3. Drop assembly_roles ────────────────────────────────────────────────────

DROP TABLE IF EXISTS assembly_roles;
