-- Track which (assembly, participant) pairs have had their survey hasResponded
-- status synced from the VCP. Without this, participants who access the surveys
-- page after the surveys_cache is already populated never get their hasResponded
-- data fetched from the VCP.
CREATE TABLE IF NOT EXISTS survey_response_checks (
  assembly_id    TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  checked_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (assembly_id, participant_id)
);
