/**
 * SQLite database adapter for the client backend.
 */

import Database from "better-sqlite3";
import type { DatabaseAdapter, RunResult } from "./interface.js";

export class SQLiteAdapter implements DatabaseAdapter {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      -- User accounts
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name          TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        status        TEXT NOT NULL DEFAULT 'active'
      );

      -- Refresh tokens for session management
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL UNIQUE,
        expires_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        revoked_at  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
        ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
        ON refresh_tokens(token_hash);

      -- User-to-participant mapping across assemblies
      CREATE TABLE IF NOT EXISTS memberships (
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assembly_id   TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        assembly_name TEXT NOT NULL,
        joined_at     TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, assembly_id)
      );
      CREATE INDEX IF NOT EXISTS idx_memberships_participant
        ON memberships(assembly_id, participant_id);

      -- Events tracked for notification scheduling (populated by proxy interceptor)
      CREATE TABLE IF NOT EXISTS tracked_events (
        id                   TEXT PRIMARY KEY,
        assembly_id          TEXT NOT NULL,
        title                TEXT NOT NULL,
        voting_start         TEXT NOT NULL,
        voting_end           TEXT NOT NULL,
        created_at           TEXT NOT NULL DEFAULT (datetime('now')),
        notified_created     INTEGER NOT NULL DEFAULT 0,
        notified_voting_open INTEGER NOT NULL DEFAULT 0,
        notified_deadline    INTEGER NOT NULL DEFAULT 0,
        notified_closed      INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_tracked_events_assembly
        ON tracked_events(assembly_id);

      -- Polls tracked for notification scheduling (populated by proxy interceptor)
      CREATE TABLE IF NOT EXISTS tracked_polls (
        id                   TEXT PRIMARY KEY,
        assembly_id          TEXT NOT NULL,
        title                TEXT NOT NULL,
        schedule             TEXT NOT NULL,
        closes_at            TEXT NOT NULL,
        created_at           TEXT NOT NULL DEFAULT (datetime('now')),
        notified_created     INTEGER NOT NULL DEFAULT 0,
        notified_deadline    INTEGER NOT NULL DEFAULT 0,
        notified_closed      INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_tracked_polls_assembly
        ON tracked_polls(assembly_id);

      -- User notification preferences (key-value per user)
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key       TEXT NOT NULL,
        value     TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );

      -- Local assembly cache (immutable after creation — avoids VCP round-trips)
      CREATE TABLE IF NOT EXISTS assemblies_cache (
        id              TEXT PRIMARY KEY,
        organization_id TEXT,
        name            TEXT NOT NULL,
        config          TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active',
        created_at      TEXT NOT NULL,
        cached_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Local topic cache (immutable after creation — avoids VCP round-trips)
      CREATE TABLE IF NOT EXISTS topics_cache (
        id            TEXT NOT NULL,
        assembly_id   TEXT NOT NULL,
        name          TEXT NOT NULL,
        parent_id     TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        cached_at     TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (assembly_id, id)
      );

      -- Local poll cache (metadata is immutable after creation)
      CREATE TABLE IF NOT EXISTS polls_cache (
        id            TEXT NOT NULL,
        assembly_id   TEXT NOT NULL,
        title         TEXT NOT NULL,
        questions     TEXT NOT NULL,
        topic_ids     TEXT NOT NULL DEFAULT '[]',
        schedule      INTEGER NOT NULL,
        closes_at     INTEGER NOT NULL,
        created_by    TEXT NOT NULL,
        cached_at     TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (assembly_id, id)
      );

      -- Poll response tracking (one-way latch: once responded, never reverted)
      CREATE TABLE IF NOT EXISTS poll_responses (
        assembly_id    TEXT NOT NULL,
        poll_id        TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        responded_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (assembly_id, poll_id, participant_id)
      );
    `);
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec("BEGIN");
    try {
      const result = await fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
