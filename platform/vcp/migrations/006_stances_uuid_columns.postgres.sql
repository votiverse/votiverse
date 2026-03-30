-- Migration 006: Fix stances table column types to use UUID
--
-- The stances table was created in migration 005 with TEXT columns for
-- assembly_id, entity_id, and participant_id. These should be UUID to
-- match the assemblies and participants tables they reference.

ALTER TABLE stances
  ALTER COLUMN assembly_id    TYPE UUID USING assembly_id::uuid,
  ALTER COLUMN entity_id      TYPE UUID USING entity_id::uuid,
  ALTER COLUMN participant_id TYPE UUID USING participant_id::uuid;
