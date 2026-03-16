/**
 * SQLite database adapter using better-sqlite3.
 *
 * All methods are async to satisfy the DatabaseAdapter interface,
 * but better-sqlite3 is synchronous — Promises resolve immediately.
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

      -- Materialized participation records (computed at tally time)
      CREATE TABLE IF NOT EXISTS issue_participation (
        assembly_id       TEXT NOT NULL,
        issue_id          TEXT NOT NULL,
        participant_id    TEXT NOT NULL,
        status            TEXT NOT NULL,
        effective_choice  TEXT,
        delegate_id       TEXT,
        terminal_voter_id TEXT,
        chain             TEXT NOT NULL DEFAULT '[]',
        computed_at       TEXT NOT NULL,
        PRIMARY KEY (assembly_id, issue_id, participant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_participation_participant
        ON issue_participation(assembly_id, participant_id);

      -- Materialized event tallies (computed when event closes)
      CREATE TABLE IF NOT EXISTS issue_tallies (
        assembly_id         TEXT NOT NULL,
        issue_id            TEXT NOT NULL,
        winner              TEXT,
        counts              TEXT NOT NULL,
        total_votes         INTEGER NOT NULL,
        quorum_met          INTEGER NOT NULL,
        quorum_threshold    REAL NOT NULL,
        eligible_count      INTEGER NOT NULL,
        participating_count INTEGER NOT NULL,
        computed_at         TEXT NOT NULL,
        PRIMARY KEY (assembly_id, issue_id)
      );

      -- Materialized delegation weights (computed per-issue when event closes)
      CREATE TABLE IF NOT EXISTS issue_weights (
        assembly_id   TEXT NOT NULL,
        issue_id      TEXT NOT NULL,
        weights       TEXT NOT NULL,
        total_weight  REAL NOT NULL,
        computed_at   TEXT NOT NULL,
        PRIMARY KEY (assembly_id, issue_id)
      );

      -- Materialized concentration metrics (computed per-issue when event closes)
      CREATE TABLE IF NOT EXISTS issue_concentration (
        assembly_id              TEXT NOT NULL,
        issue_id                 TEXT NOT NULL,
        gini_coefficient         REAL NOT NULL,
        max_weight               REAL NOT NULL,
        max_weight_holder        TEXT,
        chain_length_distribution TEXT NOT NULL,
        delegating_count         INTEGER NOT NULL,
        direct_voter_count       INTEGER NOT NULL,
        computed_at              TEXT NOT NULL,
        PRIMARY KEY (assembly_id, issue_id)
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

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
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
    // better-sqlite3 is synchronous, but our interface is async.
    // Use manual BEGIN/COMMIT so we can await the async callback.
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
