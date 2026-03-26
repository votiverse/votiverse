-- Entity endorsements: lightweight votes on candidacies and proposals.
-- One per participant per target (upsert semantics). VCP-enforced uniqueness.

CREATE TABLE IF NOT EXISTS entity_endorsements (
  assembly_id    UUID NOT NULL,
  participant_id UUID NOT NULL,
  target_type    TEXT NOT NULL CHECK (target_type IN ('candidacy', 'proposal')),
  target_id      UUID NOT NULL,
  value          TEXT NOT NULL CHECK (value IN ('endorse', 'dispute')),
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, participant_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_endorsements_target
  ON entity_endorsements(assembly_id, target_type, target_id);
