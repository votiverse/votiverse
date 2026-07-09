-- Migration 011: Soft-archive support for groups
--
-- Adds a nullable archived_at timestamp to groups. When set, the group is
-- hidden from active lists (sidebar, dashboard, browse) and governance
-- mutations are rejected, but all data is retained so an owner can restore it.
-- Archiving is a backend lifecycle concern; the VCP assembly is left untouched.

ALTER TABLE groups ADD COLUMN archived_at TIMESTAMPTZ;
