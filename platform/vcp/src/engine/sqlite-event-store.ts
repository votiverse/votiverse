/**
 * SQLite-backed EventStore implementation.
 *
 * Implements the @votiverse/core EventStore interface, scoped to a
 * single Assembly. Events are persisted to the VCP's SQLite database.
 */

import type { EventStore, EventQueryOptions, DomainEvent, EventId, Timestamp } from "@votiverse/core";
import { DuplicateEventError } from "@votiverse/core";
import type { DatabaseAdapter } from "../adapters/database/interface.js";

interface EventRow {
  id: string;
  assembly_id: string;
  event_type: string;
  payload: string;
  occurred_at: string;
  sequence_num: number;
}

export class SQLiteEventStore implements EventStore {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly assemblyId: string,
  ) {}

  async append(event: DomainEvent): Promise<void> {
    const existing = await this.db.queryOne<{ id: string }>(
      "SELECT id FROM events WHERE id = ?",
      [event.id],
    );
    if (existing) {
      throw new DuplicateEventError(event.id);
    }

    await this.db.run(
      `INSERT INTO events (id, assembly_id, event_type, payload, occurred_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        event.id,
        this.assemblyId,
        event.type,
        JSON.stringify(event.payload),
        new Date(event.timestamp).toISOString(),
      ],
    );
  }

  async getById(id: EventId): Promise<DomainEvent | undefined> {
    const row = await this.db.queryOne<EventRow>(
      "SELECT * FROM events WHERE id = ? AND assembly_id = ?",
      [id, this.assemblyId],
    );
    return row ? this.rowToEvent(row) : undefined;
  }

  async query(options?: EventQueryOptions): Promise<readonly DomainEvent[]> {
    const conditions = ["assembly_id = ?"];
    const params: unknown[] = [this.assemblyId];

    if (options?.types && options.types.length > 0) {
      const placeholders = options.types.map(() => "?").join(", ");
      conditions.push(`event_type IN (${placeholders})`);
      params.push(...options.types);
    }

    if (options?.after !== undefined) {
      conditions.push("occurred_at > ?");
      params.push(new Date(options.after).toISOString());
    }

    if (options?.before !== undefined) {
      conditions.push("occurred_at < ?");
      params.push(new Date(options.before).toISOString());
    }

    let sql = `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY sequence_num ASC`;

    if (options?.limit !== undefined && options.limit >= 0) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = await this.db.query<EventRow>(sql, params);
    return rows.map((r) => this.rowToEvent(r));
  }

  async getAll(): Promise<readonly DomainEvent[]> {
    const rows = await this.db.query<EventRow>(
      "SELECT * FROM events WHERE assembly_id = ? ORDER BY sequence_num ASC",
      [this.assemblyId],
    );
    return rows.map((r) => this.rowToEvent(r));
  }

  private rowToEvent(row: EventRow): DomainEvent {
    return {
      id: row.id as EventId,
      type: row.event_type,
      timestamp: new Date(row.occurred_at).getTime() as Timestamp,
      payload: (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as Record<string, unknown>,
    } as DomainEvent;
  }
}
