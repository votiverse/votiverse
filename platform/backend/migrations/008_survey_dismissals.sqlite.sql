CREATE TABLE IF NOT EXISTS survey_dismissals (
  assembly_id    TEXT NOT NULL,
  survey_id      TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  dismissed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (assembly_id, survey_id, participant_id)
);
