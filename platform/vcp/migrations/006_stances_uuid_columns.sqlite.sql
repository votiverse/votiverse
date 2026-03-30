-- Migration 006: No-op for SQLite (TEXT is sufficient for UUID storage)
-- PostgreSQL counterpart converts stances TEXT columns to UUID type.
SELECT 1;
