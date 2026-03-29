-- Scoring events table
CREATE TABLE IF NOT EXISTS scoring_events (
  id                TEXT PRIMARY KEY,
  assembly_id       TEXT NOT NULL REFERENCES assemblies(id),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  entries           TEXT NOT NULL,   -- JSON: ScoringEntry[]
  rubric            TEXT NOT NULL,   -- JSON: Rubric
  panel_member_ids  TEXT,            -- JSON: ParticipantId[] | null (null = all members)
  opens_at          TEXT NOT NULL,
  closes_at         TEXT NOT NULL,
  settings          TEXT NOT NULL,   -- JSON: ScoringSettings
  created_at        TEXT NOT NULL
);

-- Materialized current state: upserted on each ScorecardSubmitted/Revised event.
CREATE TABLE IF NOT EXISTS scorecards (
  id                TEXT PRIMARY KEY,
  assembly_id       TEXT NOT NULL,
  scoring_event_id  TEXT NOT NULL REFERENCES scoring_events(id),
  evaluator_id      TEXT NOT NULL,
  entry_id          TEXT NOT NULL,
  scores            TEXT NOT NULL,  -- JSON: DimensionScore[]
  submitted_at      TEXT NOT NULL,
  UNIQUE(scoring_event_id, evaluator_id, entry_id)
);

-- Materialized ranking: recomputed on demand from current scorecards.
CREATE TABLE IF NOT EXISTS scoring_results (
  assembly_id       TEXT NOT NULL,
  scoring_event_id  TEXT NOT NULL REFERENCES scoring_events(id),
  entries           TEXT NOT NULL,  -- JSON: EntryResult[]
  eligible_count    INTEGER NOT NULL,
  participating_count INTEGER NOT NULL,
  participation_rate REAL NOT NULL,
  computed_at       TEXT NOT NULL,
  PRIMARY KEY (assembly_id, scoring_event_id)
);
