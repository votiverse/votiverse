-- Migration 011: Soft-archive support for groups.
-- Nullable archived_at; when set the group is hidden from active lists and
-- rejects governance mutations, but is retained for restore by the owner.
-- See the postgres variant for full notes.

ALTER TABLE groups ADD COLUMN archived_at TEXT;
