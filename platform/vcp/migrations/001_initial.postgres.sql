-- VCP initial schema (PostgreSQL)

-- Core event log, append-only
CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY,
  assembly_id   UUID NOT NULL,
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sequence_num  BIGINT
);
CREATE INDEX IF NOT EXISTS idx_events_assembly
  ON events(assembly_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_events_type
  ON events(assembly_id, event_type, occurred_at);

-- Assembly registry
CREATE TABLE IF NOT EXISTS assemblies (
  id              UUID PRIMARY KEY,
  organization_id TEXT,
  name            TEXT NOT NULL,
  config          JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status          TEXT NOT NULL DEFAULT 'active'
);

-- Client registry
CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY,
  name            TEXT NOT NULL,
  api_key_hash    TEXT NOT NULL,
  assembly_access JSONB NOT NULL DEFAULT '[]',
  rate_limits     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Participants per assembly
CREATE TABLE IF NOT EXISTS participants (
  id              UUID NOT NULL,
  assembly_id     UUID NOT NULL,
  name            TEXT NOT NULL,
  registered_at   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  PRIMARY KEY (assembly_id, id)
);

-- Issues
CREATE TABLE IF NOT EXISTS issues (
  id              UUID NOT NULL,
  assembly_id     UUID NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  topic_id        UUID DEFAULT NULL,
  voting_event_id UUID NOT NULL,
  choices         JSONB,
  PRIMARY KEY (assembly_id, id)
);

-- Topic taxonomy per assembly
CREATE TABLE IF NOT EXISTS topics (
  id            UUID NOT NULL,
  assembly_id   UUID NOT NULL,
  name          TEXT NOT NULL,
  parent_id     UUID,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (assembly_id, id)
);

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id              UUID PRIMARY KEY,
  client_id       UUID NOT NULL,
  assembly_id     UUID NOT NULL,
  endpoint_url    TEXT NOT NULL,
  event_types     JSONB NOT NULL,
  secret          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Materialized participation records
CREATE TABLE IF NOT EXISTS issue_participation (
  assembly_id       UUID NOT NULL,
  issue_id          UUID NOT NULL,
  participant_id    UUID NOT NULL,
  status            TEXT NOT NULL,
  effective_choice  TEXT,
  delegate_id       UUID,
  terminal_voter_id UUID,
  chain             JSONB NOT NULL DEFAULT '[]',
  computed_at       TEXT NOT NULL,
  PRIMARY KEY (assembly_id, issue_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_participation_participant
  ON issue_participation(assembly_id, participant_id);

-- Materialized event tallies
CREATE TABLE IF NOT EXISTS issue_tallies (
  assembly_id         UUID NOT NULL,
  issue_id            UUID NOT NULL,
  winner              TEXT,
  counts              JSONB NOT NULL,
  total_votes         INTEGER NOT NULL,
  quorum_met          BOOLEAN NOT NULL,
  quorum_threshold    DOUBLE PRECISION NOT NULL,
  eligible_count      INTEGER NOT NULL,
  participating_count INTEGER NOT NULL,
  computed_at         TEXT NOT NULL,
  PRIMARY KEY (assembly_id, issue_id)
);

-- Materialized delegation weights
CREATE TABLE IF NOT EXISTS issue_weights (
  assembly_id   UUID NOT NULL,
  issue_id      UUID NOT NULL,
  weights       JSONB NOT NULL,
  total_weight  DOUBLE PRECISION NOT NULL,
  computed_at   TEXT NOT NULL,
  PRIMARY KEY (assembly_id, issue_id)
);

-- Assembly roles — materialized from RoleGranted/RoleRevoked events
CREATE TABLE IF NOT EXISTS assembly_roles (
  assembly_id     UUID NOT NULL,
  participant_id  UUID NOT NULL,
  role            TEXT NOT NULL,
  granted_by      UUID NOT NULL,
  granted_at      BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, participant_id, role)
);
CREATE INDEX IF NOT EXISTS idx_assembly_roles_assembly
  ON assembly_roles(assembly_id, role);

-- Materialized concentration metrics
CREATE TABLE IF NOT EXISTS issue_concentration (
  assembly_id              UUID NOT NULL,
  issue_id                 UUID NOT NULL,
  gini_coefficient         DOUBLE PRECISION NOT NULL,
  max_weight               DOUBLE PRECISION NOT NULL,
  max_weight_holder        UUID,
  chain_length_distribution JSONB NOT NULL,
  delegating_count         INTEGER NOT NULL,
  direct_voter_count       INTEGER NOT NULL,
  computed_at              TEXT NOT NULL,
  PRIMARY KEY (assembly_id, issue_id)
);

-- Proposals (governance metadata only — content lives in client backend)
CREATE TABLE IF NOT EXISTS proposals (
  id                UUID NOT NULL,
  assembly_id       UUID NOT NULL,
  issue_id          UUID NOT NULL,
  choice_key        TEXT,
  author_id         UUID NOT NULL,
  title             TEXT NOT NULL,
  current_version   INTEGER NOT NULL DEFAULT 1,
  endorsement_count INTEGER NOT NULL DEFAULT 0,
  dispute_count     INTEGER NOT NULL DEFAULT 0,
  featured          BOOLEAN NOT NULL DEFAULT FALSE,
  status            TEXT NOT NULL DEFAULT 'submitted',
  submitted_at      BIGINT NOT NULL,
  locked_at         BIGINT,
  withdrawn_at      BIGINT,
  PRIMARY KEY (assembly_id, id)
);
CREATE INDEX IF NOT EXISTS idx_proposals_issue
  ON proposals(assembly_id, issue_id);

-- Proposal endorsements (one per participant per proposal)
CREATE TABLE IF NOT EXISTS proposal_endorsements (
  assembly_id     UUID NOT NULL,
  proposal_id     UUID NOT NULL,
  participant_id  UUID NOT NULL,
  evaluation      TEXT NOT NULL,
  evaluated_at    BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, proposal_id, participant_id)
);

-- Booklet recommendations (organizer editorial per issue)
CREATE TABLE IF NOT EXISTS booklet_recommendations (
  assembly_id   UUID NOT NULL,
  event_id      UUID NOT NULL,
  issue_id      UUID NOT NULL,
  author_id     UUID NOT NULL,
  content_hash  TEXT NOT NULL,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, event_id, issue_id)
);

-- Voting event creators (tracks who created each event)
CREATE TABLE IF NOT EXISTS voting_event_creators (
  assembly_id     UUID NOT NULL,
  event_id        UUID NOT NULL,
  participant_id  UUID NOT NULL,
  PRIMARY KEY (assembly_id, event_id)
);

-- Proposal versions (append-only history)
CREATE TABLE IF NOT EXISTS proposal_versions (
  assembly_id     UUID NOT NULL,
  proposal_id     UUID NOT NULL,
  version_number  INTEGER NOT NULL,
  content_hash    TEXT NOT NULL,
  created_at      BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, proposal_id, version_number)
);

-- Candidacies (governance metadata only)
CREATE TABLE IF NOT EXISTS candidacies (
  id                       UUID NOT NULL,
  assembly_id              UUID NOT NULL,
  participant_id           UUID NOT NULL,
  topic_scope              JSONB NOT NULL DEFAULT '[]',
  vote_transparency_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  current_version          INTEGER NOT NULL DEFAULT 1,
  status                   TEXT NOT NULL DEFAULT 'active',
  declared_at              BIGINT NOT NULL,
  withdrawn_at             BIGINT,
  PRIMARY KEY (assembly_id, id)
);
CREATE INDEX IF NOT EXISTS idx_candidacies_participant
  ON candidacies(assembly_id, participant_id);

-- Candidacy versions (append-only history)
CREATE TABLE IF NOT EXISTS candidacy_versions (
  assembly_id     UUID NOT NULL,
  candidacy_id    UUID NOT NULL,
  version_number  INTEGER NOT NULL,
  content_hash    TEXT NOT NULL,
  topic_scope     JSONB,
  vote_transparency_opt_in BOOLEAN,
  created_at      BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, candidacy_id, version_number)
);

-- Community notes (governance metadata only)
CREATE TABLE IF NOT EXISTS community_notes (
  id                    UUID NOT NULL,
  assembly_id           UUID NOT NULL,
  author_id             UUID NOT NULL,
  content_hash          TEXT NOT NULL,
  target_type           TEXT NOT NULL,
  target_id             UUID NOT NULL,
  target_version_number INTEGER,
  endorsement_count     INTEGER NOT NULL DEFAULT 0,
  dispute_count         INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'proposed',
  created_at            BIGINT NOT NULL,
  withdrawn_at          BIGINT,
  PRIMARY KEY (assembly_id, id)
);
CREATE INDEX IF NOT EXISTS idx_notes_target
  ON community_notes(assembly_id, target_type, target_id);

-- Note evaluations (one per participant per note)
CREATE TABLE IF NOT EXISTS note_evaluations (
  assembly_id     UUID NOT NULL,
  note_id         UUID NOT NULL,
  participant_id  UUID NOT NULL,
  evaluation      TEXT NOT NULL,
  evaluated_at    BIGINT NOT NULL,
  PRIMARY KEY (assembly_id, note_id, participant_id)
);

-- Auto-sequence trigger for events
CREATE OR REPLACE FUNCTION events_auto_sequence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sequence_num IS NULL THEN
    SELECT COALESCE(MAX(sequence_num), 0) + 1
    INTO NEW.sequence_num
    FROM events
    WHERE assembly_id = NEW.assembly_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER events_sequence_num_trigger
    BEFORE INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION events_auto_sequence();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
