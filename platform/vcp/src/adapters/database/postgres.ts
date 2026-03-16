/**
 * PostgreSQL database adapter using node-postgres (pg).
 *
 * Uses AsyncLocalStorage to scope queries to transactional clients
 * when inside a transaction() call.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import type { DatabaseAdapter, RunResult } from "./interface.js";

/**
 * Translate `?` placeholders to PostgreSQL `$1, $2, ...` style.
 * Safe for this codebase where `?` never appears in string literals.
 */
function translatePlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export class PostgresAdapter implements DatabaseAdapter {
  private readonly pool: pg.Pool;
  private readonly als = new AsyncLocalStorage<pg.PoolClient>();

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        -- Core event log, append-only
        CREATE TABLE IF NOT EXISTS events (
          id            TEXT PRIMARY KEY,
          assembly_id   TEXT NOT NULL,
          event_type    TEXT NOT NULL,
          payload       JSONB NOT NULL,
          occurred_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sequence_num  BIGINT
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
          config          JSONB NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          status          TEXT NOT NULL DEFAULT 'active'
        );

        -- Client registry
        CREATE TABLE IF NOT EXISTS clients (
          id              TEXT PRIMARY KEY,
          name            TEXT NOT NULL,
          api_key_hash    TEXT NOT NULL,
          assembly_access JSONB NOT NULL DEFAULT '[]',
          rate_limits     TEXT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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

        -- Issues
        CREATE TABLE IF NOT EXISTS issues (
          id              TEXT NOT NULL,
          assembly_id     TEXT NOT NULL,
          title           TEXT NOT NULL,
          description     TEXT NOT NULL DEFAULT '',
          topic_ids       JSONB NOT NULL DEFAULT '[]',
          voting_event_id TEXT NOT NULL,
          choices         JSONB,
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
          event_types     JSONB NOT NULL,
          secret          TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'active',
          created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- Materialized participation records
        CREATE TABLE IF NOT EXISTS issue_participation (
          assembly_id       TEXT NOT NULL,
          issue_id          TEXT NOT NULL,
          participant_id    TEXT NOT NULL,
          status            TEXT NOT NULL,
          effective_choice  TEXT,
          delegate_id       TEXT,
          terminal_voter_id TEXT,
          chain             JSONB NOT NULL DEFAULT '[]',
          computed_at       TEXT NOT NULL,
          PRIMARY KEY (assembly_id, issue_id, participant_id)
        );
        CREATE INDEX IF NOT EXISTS idx_participation_participant
          ON issue_participation(assembly_id, participant_id);

        -- Materialized event tallies
        CREATE TABLE IF NOT EXISTS issue_tallies (
          assembly_id         TEXT NOT NULL,
          issue_id            TEXT NOT NULL,
          winner              TEXT,
          counts              JSONB NOT NULL,
          total_votes         INTEGER NOT NULL,
          quorum_met          BOOLEAN NOT NULL,
          quorum_threshold    DOUBLE PRECISION NOT NULL,
          eligible_count      INTEGER NOT NULL,
          participating_count INTEGER NOT NULL,
          computed_at         TEXT NOT NULL,
          PRIMARY KEY (assembly_id, issue_id)
        );

        -- Materialized delegation weights
        CREATE TABLE IF NOT EXISTS issue_weights (
          assembly_id   TEXT NOT NULL,
          issue_id      TEXT NOT NULL,
          weights       JSONB NOT NULL,
          total_weight  DOUBLE PRECISION NOT NULL,
          computed_at   TEXT NOT NULL,
          PRIMARY KEY (assembly_id, issue_id)
        );

        -- Materialized concentration metrics
        CREATE TABLE IF NOT EXISTS issue_concentration (
          assembly_id              TEXT NOT NULL,
          issue_id                 TEXT NOT NULL,
          gini_coefficient         DOUBLE PRECISION NOT NULL,
          max_weight               DOUBLE PRECISION NOT NULL,
          max_weight_holder        TEXT,
          chain_length_distribution JSONB NOT NULL,
          delegating_count         INTEGER NOT NULL,
          direct_voter_count       INTEGER NOT NULL,
          computed_at              TEXT NOT NULL,
          PRIMARY KEY (assembly_id, issue_id)
        );
      `);

      // Auto-sequence trigger for events
      await client.query(`
        CREATE OR REPLACE FUNCTION events_auto_sequence()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.sequence_num IS NULL THEN
            SELECT COALESCE(MAX(sequence_num), 0) + 1
            INTO NEW.sequence_num
            FROM events
            WHERE assembly_id = NEW.assembly_id;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Create trigger only if it doesn't exist
      await client.query(`
        DO $$ BEGIN
          CREATE TRIGGER events_sequence_num_trigger
            BEFORE INSERT ON events
            FOR EACH ROW
            EXECUTE FUNCTION events_auto_sequence();
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
    } finally {
      client.release();
    }
  }

  /** Get the active client — transactional if inside transaction(), else pool. */
  private getClient(): pg.Pool | pg.PoolClient {
    return this.als.getStore() ?? this.pool;
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = await this.getClient().query(translatePlaceholders(sql), params);
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: 0,
    };
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.getClient().query(translatePlaceholders(sql), params);
    return result.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.getClient().query(translatePlaceholders(sql), params);
    return (result.rows[0] as T) ?? undefined;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.als.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
