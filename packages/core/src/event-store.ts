/**
 * @votiverse/core — EventStore interface
 *
 * Abstract interface for event persistence. Implementations may target
 * in-memory (testing), SQLite (local), PostgreSQL (production), or
 * custom backends.
 */

import type { DomainEvent, EventType } from "./events.js";
import type { EventId, Timestamp } from "./types.js";

/**
 * Options for querying events from the store.
 */
export interface EventQueryOptions {
  /** Return only events of these types. */
  readonly types?: readonly EventType[];
  /** Return only events after this timestamp (exclusive). */
  readonly after?: Timestamp;
  /** Return only events before this timestamp (exclusive). */
  readonly before?: Timestamp;
  /** Maximum number of events to return. */
  readonly limit?: number;
}

/**
 * Abstract event store interface.
 *
 * The event store is an append-only log. Events are immutable once written.
 * Implementations must guarantee:
 * - Events are returned in insertion order (by timestamp, then by insertion).
 * - An event with a duplicate ID is rejected.
 * - Reads are consistent: an appended event is immediately visible.
 */
export interface EventStore {
  /**
   * Append an event to the store.
   * @throws {DuplicateEventError} if an event with the same ID already exists.
   */
  append(event: DomainEvent): Promise<void>;

  /**
   * Retrieve a single event by its ID.
   * Returns undefined if no event with this ID exists.
   */
  getById(id: EventId): Promise<DomainEvent | undefined>;

  /**
   * Retrieve events matching the given query options.
   * Results are ordered by timestamp ascending.
   */
  query(options?: EventQueryOptions): Promise<readonly DomainEvent[]>;

  /**
   * Retrieve all events in insertion order.
   * Equivalent to query({}).
   */
  getAll(): Promise<readonly DomainEvent[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (for testing and simulation)
// ---------------------------------------------------------------------------

/**
 * In-memory event store. Suitable for testing, simulation, and small
 * ephemeral deployments. Not suitable for production.
 */
export class InMemoryEventStore implements EventStore {
  private readonly events: DomainEvent[] = [];
  private readonly index = new Map<EventId, DomainEvent>();

  async append(event: DomainEvent): Promise<void> {
    if (this.index.has(event.id)) {
      throw new DuplicateEventError(event.id);
    }
    this.events.push(event);
    this.index.set(event.id, event);
  }

  async getById(id: EventId): Promise<DomainEvent | undefined> {
    return this.index.get(id);
  }

  async query(options?: EventQueryOptions): Promise<readonly DomainEvent[]> {
    let result: DomainEvent[] = this.events;

    if (options?.types && options.types.length > 0) {
      const typeSet = new Set<EventType>(options.types);
      result = result.filter((e) => typeSet.has(e.type));
    }

    if (options?.after !== undefined) {
      const after = options.after;
      result = result.filter((e) => e.timestamp > after);
    }

    if (options?.before !== undefined) {
      const before = options.before;
      result = result.filter((e) => e.timestamp < before);
    }

    if (options?.limit !== undefined && options.limit >= 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async getAll(): Promise<readonly DomainEvent[]> {
    return [...this.events];
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

import { VotiverseError } from "./errors.js";

/** Thrown when attempting to append an event with a duplicate ID. */
export class DuplicateEventError extends VotiverseError {
  constructor(public readonly eventId: EventId) {
    super(`Event with ID "${eventId}" already exists in the store`);
    this.name = "DuplicateEventError";
  }
}
