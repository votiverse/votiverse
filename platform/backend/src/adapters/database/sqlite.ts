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
        id                    TEXT PRIMARY KEY,
        email                 TEXT UNIQUE NOT NULL,
        password_hash         TEXT NOT NULL,
        name                  TEXT NOT NULL,
        handle                TEXT UNIQUE,
        avatar_url            TEXT,
        bio                   TEXT NOT NULL DEFAULT '',
        created_at            TEXT NOT NULL DEFAULT (datetime('now')),
        status                TEXT NOT NULL DEFAULT 'active',
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until          TEXT,
        email_verified        INTEGER NOT NULL DEFAULT 0,
        verification_token    TEXT,
        verification_expires  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);

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

      -- Surveys tracked for notification scheduling (populated by proxy interceptor)
      CREATE TABLE IF NOT EXISTS tracked_surveys (
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
      CREATE INDEX IF NOT EXISTS idx_tracked_surveys_assembly
        ON tracked_surveys(assembly_id);

      -- User notification preferences (key-value per user)
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key       TEXT NOT NULL,
        value     TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );

      -- Invitations (link-based and direct)
      CREATE TABLE IF NOT EXISTS invitations (
        id              TEXT PRIMARY KEY,
        assembly_id     TEXT NOT NULL,
        type            TEXT NOT NULL,
        token           TEXT UNIQUE,
        invited_by      TEXT NOT NULL,
        invitee_handle  TEXT,
        max_uses        INTEGER,
        use_count       INTEGER NOT NULL DEFAULT 0,
        expires_at      TEXT,
        status          TEXT NOT NULL DEFAULT 'active',
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
      CREATE INDEX IF NOT EXISTS idx_invitations_assembly ON invitations(assembly_id);

      CREATE TABLE IF NOT EXISTS invitation_acceptances (
        id              TEXT PRIMARY KEY,
        invitation_id   TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        accepted_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Local assembly cache (immutable after creation — avoids VCP round-trips)
      CREATE TABLE IF NOT EXISTS assemblies_cache (
        id              TEXT PRIMARY KEY,
        organization_id TEXT,
        name            TEXT NOT NULL,
        config          TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active',
        created_at      TEXT NOT NULL,
        cached_at       TEXT NOT NULL DEFAULT (datetime('now')),
        admission_mode  TEXT NOT NULL DEFAULT 'approval'
      );

      -- Join requests (for approval admission mode)
      CREATE TABLE IF NOT EXISTS join_requests (
        id              TEXT PRIMARY KEY,
        assembly_id     TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        user_name       TEXT NOT NULL,
        user_handle     TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        reviewed_by     TEXT,
        reviewed_at     TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_join_requests_assembly_status
        ON join_requests(assembly_id, status);
      CREATE INDEX IF NOT EXISTS idx_join_requests_user
        ON join_requests(user_id);

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

      -- Local survey cache (metadata is immutable after creation)
      CREATE TABLE IF NOT EXISTS surveys_cache (
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

      -- Proposal drafts (backend-only, mutable, discarded on submit)
      CREATE TABLE IF NOT EXISTS proposal_drafts (
        id            TEXT PRIMARY KEY,
        assembly_id   TEXT NOT NULL,
        issue_id      TEXT NOT NULL,
        choice_key    TEXT,
        author_id     TEXT NOT NULL,
        title         TEXT NOT NULL,
        markdown      TEXT NOT NULL DEFAULT '',
        assets        TEXT NOT NULL DEFAULT '[]',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_proposal_drafts_author
        ON proposal_drafts(assembly_id, author_id);

      -- Proposal content (immutable versions, keyed by VCP proposal ID)
      CREATE TABLE IF NOT EXISTS proposal_content (
        proposal_id    TEXT NOT NULL,
        assembly_id    TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        markdown       TEXT NOT NULL,
        assets         TEXT NOT NULL DEFAULT '[]',
        content_hash   TEXT NOT NULL,
        change_summary TEXT,
        created_at     INTEGER NOT NULL,
        PRIMARY KEY (assembly_id, proposal_id, version_number)
      );

      -- Candidacy content (immutable versions, keyed by VCP candidacy ID)
      CREATE TABLE IF NOT EXISTS candidacy_content (
        candidacy_id   TEXT NOT NULL,
        assembly_id    TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        markdown       TEXT NOT NULL,
        assets         TEXT NOT NULL DEFAULT '[]',
        content_hash   TEXT NOT NULL,
        change_summary TEXT,
        created_at     INTEGER NOT NULL,
        PRIMARY KEY (assembly_id, candidacy_id, version_number)
      );

      -- Note content (immutable, keyed by VCP note ID)
      CREATE TABLE IF NOT EXISTS note_content (
        note_id      TEXT NOT NULL,
        assembly_id  TEXT NOT NULL,
        markdown     TEXT NOT NULL,
        assets       TEXT NOT NULL DEFAULT '[]',
        content_hash TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        PRIMARY KEY (assembly_id, note_id)
      );

      -- Booklet recommendation content (backend-owned, linked to VCP metadata)
      CREATE TABLE IF NOT EXISTS booklet_recommendation_content (
        assembly_id  TEXT NOT NULL,
        event_id     TEXT NOT NULL,
        issue_id     TEXT NOT NULL,
        markdown     TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (assembly_id, event_id, issue_id)
      );

      -- Binary assets (images, videos, PDFs)
      CREATE TABLE IF NOT EXISTS assets (
        id           TEXT PRIMARY KEY,
        assembly_id  TEXT NOT NULL,
        filename     TEXT NOT NULL,
        mime_type    TEXT NOT NULL,
        size_bytes   INTEGER NOT NULL,
        hash         TEXT NOT NULL,
        uploaded_by  TEXT NOT NULL,
        uploaded_at  INTEGER NOT NULL,
        data         BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_assets_assembly
        ON assets(assembly_id);

      -- In-app notification feed (persistent, independent of email delivery)
      CREATE TABLE IF NOT EXISTS notifications (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assembly_id     TEXT NOT NULL,
        type            TEXT NOT NULL,
        urgency         TEXT NOT NULL DEFAULT 'info',
        title           TEXT NOT NULL,
        body            TEXT,
        action_url      TEXT,
        read_at         TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications(user_id, read_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications(user_id, created_at DESC);

      -- Survey response tracking (one-way latch: once responded, never reverted)
      CREATE TABLE IF NOT EXISTS survey_responses (
        assembly_id    TEXT NOT NULL,
        survey_id      TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        responded_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (assembly_id, survey_id, participant_id)
      );

      -- Push notification device tokens
      CREATE TABLE IF NOT EXISTS device_tokens (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform   TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
        token      TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_user_platform_token
        ON device_tokens(user_id, platform, token);
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
