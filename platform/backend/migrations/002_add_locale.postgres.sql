-- Add locale column to users table
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
