-- Scoring lifecycle v2: explicit status, deadline extension, draft support.
-- status stores the commanded status (draft/open/closed).
-- Effective status is derived on read from status + start_as_draft + timestamps + now.

ALTER TABLE scoring_events ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE scoring_events ADD COLUMN original_closes_at TEXT;
ALTER TABLE scoring_events ADD COLUMN start_as_draft INTEGER NOT NULL DEFAULT 0;
