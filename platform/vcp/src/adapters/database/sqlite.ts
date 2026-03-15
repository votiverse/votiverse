/**
 * SQLite database adapter using better-sqlite3.
 *
 * Adapts the PostgreSQL schema from vcp-architecture.md Section 5
 * for SQLite: UUID→TEXT, JSONB→TEXT, TIMESTAMPTZ→TEXT, arrays→JSON text.
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

  initialize(): void {
    this.db.exec(`
      -- Core event log, append-only
      CREATE TABLE IF NOT EXISTS events (
        id            TEXT PRIMARY KEY,
        assembly_id   TEXT NOT NULL,
        event_type    TEXT NOT NULL,
        payload       TEXT NOT NULL,
        occurred_at   TEXT NOT NULL DEFAULT (datetime('now')),
        sequence_num  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_events_assembly
        ON events(assembly_id, sequence_num);
      CREATE INDEX IF NOT EXISTS idx_events_type
        ON events(assembly_id, event_type, occurred_at);

      -- Assembly registry
      CREATE TABLE IF NOT EXISTS assemblies (
        id              TEXT PRIMARY KEY,
        organization_id TEXT,
        name            TEXT NOT NULL,
        config          TEXT NOT NULL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        status          TEXT NOT NULL DEFAULT 'active'
      );

      -- Client registry
      CREATE TABLE IF NOT EXISTS clients (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        api_key_hash    TEXT NOT NULL,
        assembly_access TEXT NOT NULL DEFAULT '[]',
        rate_limits     TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Participants per assembly
      CREATE TABLE IF NOT EXISTS participants (
        id              TEXT NOT NULL,
        assembly_id     TEXT NOT NULL,
        name            TEXT NOT NULL,
        registered_at   TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active',
        PRIMARY KEY (assembly_id, id)
      );

      -- Issues (stored separately from events — engine limitation)
      CREATE TABLE IF NOT EXISTS issues (
        id              TEXT NOT NULL,
        assembly_id     TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        topic_ids       TEXT NOT NULL DEFAULT '[]',
        voting_event_id TEXT NOT NULL,
        choices         TEXT,
        PRIMARY KEY (assembly_id, id)
      );

      -- Topic taxonomy per assembly
      CREATE TABLE IF NOT EXISTS topics (
        id            TEXT NOT NULL,
        assembly_id   TEXT NOT NULL,
        name          TEXT NOT NULL,
        parent_id     TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (assembly_id, id)
      );

      -- Webhook subscriptions
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id              TEXT PRIMARY KEY,
        client_id       TEXT NOT NULL,
        assembly_id     TEXT NOT NULL,
        endpoint_url    TEXT NOT NULL,
        event_types     TEXT NOT NULL,
        secret          TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active',
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Auto-increment trigger for sequence numbers
      CREATE TRIGGER IF NOT EXISTS events_sequence_num
        AFTER INSERT ON events
        WHEN NEW.sequence_num IS NULL
      BEGIN
        UPDATE events
        SET sequence_num = (
          SELECT COALESCE(MAX(sequence_num), 0) + 1
          FROM events
          WHERE assembly_id = NEW.assembly_id
        )
        WHERE id = NEW.id;
      END;
    `);
  }

  run(sql: string, params: unknown[] = []): RunResult {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
