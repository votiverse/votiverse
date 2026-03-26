-- Add per-membership profile fields: title, avatar, banner.
-- These are contextual to the group (e.g., "Treasurer" in a condo board).
-- All nullable — when null, the member presents with account-level defaults.

ALTER TABLE memberships ADD COLUMN title TEXT;
ALTER TABLE memberships ADD COLUMN avatar_url TEXT;
ALTER TABLE memberships ADD COLUMN banner_url TEXT;
