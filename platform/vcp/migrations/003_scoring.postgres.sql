-- Scoring events table
CREATE TABLE IF NOT EXISTS scoring_events (
  id                UUID PRIMARY KEY,
  assembly_id       UUID NOT NULL REFERENCES assemblies(id),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  entries           JSONB NOT NULL,
  rubric            JSONB NOT NULL,
  panel_member_ids  JSONB,            -- null = all members
  opens_at          TIMESTAMPTZ NOT NULL,
  closes_at         TIMESTAMPTZ NOT NULL,
  settings          JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Materialized current state: upserted on each ScorecardSubmitted/Revised event.
CREATE TABLE IF NOT EXISTS scorecards (
  id                UUID PRIMARY KEY,
  assembly_id       UUID NOT NULL,
  scoring_event_id  UUID NOT NULL REFERENCES scoring_events(id),
  evaluator_id      UUID NOT NULL,
  entry_id          UUID NOT NULL,
  scores            JSONB NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL,
  UNIQUE(scoring_event_id, evaluator_id, entry_id)
);

-- Materialized ranking: recomputed on demand from current scorecards.
CREATE TABLE IF NOT EXISTS scoring_results (
  assembly_id       UUID NOT NULL,
  scoring_event_id  UUID NOT NULL REFERENCES scoring_events(id),
  entries           JSONB NOT NULL,
  eligible_count    INTEGER NOT NULL,
  participating_count INTEGER NOT NULL,
  participation_rate REAL NOT NULL,
  computed_at       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (assembly_id, scoring_event_id)
);
