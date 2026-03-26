-- Entity endorsements: lightweight votes on candidacies and proposals.
-- One per participant per target (upsert semantics). VCP-enforced uniqueness.

CREATE TABLE IF NOT EXISTS entity_endorsements (
  assembly_id    TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  target_type    TEXT NOT NULL CHECK (target_type IN ('candidacy', 'proposal')),
  target_id      TEXT NOT NULL,
  value          TEXT NOT NULL CHECK (value IN ('endorse', 'dispute')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (assembly_id, participant_id, target_type, target_id)
);

-- Fast aggregate lookups: count endorsements per target
CREATE INDEX IF NOT EXISTS idx_endorsements_target
  ON entity_endorsements(assembly_id, target_type, target_id);
