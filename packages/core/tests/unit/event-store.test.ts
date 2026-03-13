import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, DuplicateEventError } from "../../src/event-store.js";
import { createEvent } from "../../src/events.js";
import type {
  ParticipantRegisteredEvent,
  VoteCastEvent,
  DelegationCreatedEvent,
  DomainEvent,
} from "../../src/events.js";
import type {
  EventId,
  ParticipantId,
  IssueId,
  DelegationId,
  TopicId,
  Timestamp,
} from "../../src/types.js";
import { VotiverseError } from "../../src/errors.js";

describe("InMemoryEventStore", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  function makeParticipantEvent(
    id: string,
    name: string,
    ts: number,
  ): ParticipantRegisteredEvent {
    return createEvent<ParticipantRegisteredEvent>(
      "ParticipantRegistered",
      {
        participantId: `p-${name.toLowerCase()}` as ParticipantId,
        name,
      },
      id as EventId,
      ts as Timestamp,
    );
  }

  function makeVoteEvent(
    id: string,
    participantId: string,
    issueId: string,
    choice: string,
    ts: number,
  ): VoteCastEvent {
    return createEvent<VoteCastEvent>(
      "VoteCast",
      {
        participantId: participantId as ParticipantId,
        issueId: issueId as IssueId,
        choice,
      },
      id as EventId,
      ts as Timestamp,
    );
  }

  describe("append()", () => {
    it("appends an event to the store", async () => {
      const event = makeParticipantEvent("evt-1", "Alice", 1000);
      await store.append(event);

      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual(event);
    });

    it("appends multiple events in order", async () => {
      const e1 = makeParticipantEvent("evt-1", "Alice", 1000);
      const e2 = makeParticipantEvent("evt-2", "Bob", 2000);
      const e3 = makeParticipantEvent("evt-3", "Carol", 3000);

      await store.append(e1);
      await store.append(e2);
      await store.append(e3);

      const all = await store.getAll();
      expect(all).toHaveLength(3);
      expect(all[0]!.id).toBe("evt-1");
      expect(all[1]!.id).toBe("evt-2");
      expect(all[2]!.id).toBe("evt-3");
    });

    it("rejects duplicate event IDs", async () => {
      const event = makeParticipantEvent("evt-1", "Alice", 1000);
      await store.append(event);

      const duplicate = makeParticipantEvent("evt-1", "Bob", 2000);
      await expect(store.append(duplicate)).rejects.toThrow(
        DuplicateEventError,
      );
    });

    it("DuplicateEventError is a VotiverseError", async () => {
      const event = makeParticipantEvent("evt-1", "Alice", 1000);
      await store.append(event);

      try {
        await store.append(makeParticipantEvent("evt-1", "Bob", 2000));
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateEventError);
        expect(error).toBeInstanceOf(VotiverseError);
        expect((error as DuplicateEventError).eventId).toBe("evt-1");
      }
    });
  });

  describe("getById()", () => {
    it("retrieves an event by its ID", async () => {
      const event = makeParticipantEvent("evt-1", "Alice", 1000);
      await store.append(event);

      const retrieved = await store.getById("evt-1" as EventId);
      expect(retrieved).toEqual(event);
    });

    it("returns undefined for non-existent IDs", async () => {
      const retrieved = await store.getById("nonexistent" as EventId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getAll()", () => {
    it("returns empty array for empty store", async () => {
      const all = await store.getAll();
      expect(all).toEqual([]);
    });

    it("returns all events in insertion order", async () => {
      await store.append(makeParticipantEvent("evt-1", "Alice", 3000));
      await store.append(makeParticipantEvent("evt-2", "Bob", 1000));
      await store.append(makeParticipantEvent("evt-3", "Carol", 2000));

      const all = await store.getAll();
      expect(all).toHaveLength(3);
      expect(all[0]!.id).toBe("evt-1");
      expect(all[1]!.id).toBe("evt-2");
      expect(all[2]!.id).toBe("evt-3");
    });

    it("returns a copy, not the internal array", async () => {
      await store.append(makeParticipantEvent("evt-1", "Alice", 1000));
      const all1 = await store.getAll();
      const all2 = await store.getAll();
      expect(all1).not.toBe(all2);
      expect(all1).toEqual(all2);
    });
  });

  describe("query()", () => {
    beforeEach(async () => {
      await store.append(makeParticipantEvent("evt-1", "Alice", 1000));
      await store.append(
        makeVoteEvent("evt-2", "p-alice", "i-1", "for", 2000),
      );
      await store.append(makeParticipantEvent("evt-3", "Bob", 3000));
      await store.append(
        makeVoteEvent("evt-4", "p-bob", "i-1", "against", 4000),
      );
    });

    it("returns all events when no options provided", async () => {
      const events = await store.query();
      expect(events).toHaveLength(4);
    });

    it("filters by event type", async () => {
      const events = await store.query({ types: ["VoteCast"] });
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.type === "VoteCast")).toBe(true);
    });

    it("filters by multiple event types", async () => {
      const events = await store.query({
        types: ["VoteCast", "ParticipantRegistered"],
      });
      expect(events).toHaveLength(4);
    });

    it("filters by after timestamp", async () => {
      const events = await store.query({ after: 2000 as Timestamp });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("evt-3");
      expect(events[1]!.id).toBe("evt-4");
    });

    it("filters by before timestamp", async () => {
      const events = await store.query({ before: 3000 as Timestamp });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("evt-1");
      expect(events[1]!.id).toBe("evt-2");
    });

    it("filters by time range", async () => {
      const events = await store.query({
        after: 1000 as Timestamp,
        before: 4000 as Timestamp,
      });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("evt-2");
      expect(events[1]!.id).toBe("evt-3");
    });

    it("limits the number of results", async () => {
      const events = await store.query({ limit: 2 });
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("evt-1");
      expect(events[1]!.id).toBe("evt-2");
    });

    it("combines type filter with time range", async () => {
      const events = await store.query({
        types: ["VoteCast"],
        after: 1000 as Timestamp,
        before: 4000 as Timestamp,
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.id).toBe("evt-2");
    });

    it("returns empty array when no events match", async () => {
      const events = await store.query({
        types: ["PollCreated"],
      });
      expect(events).toEqual([]);
    });

    it("respects limit of 0", async () => {
      const events = await store.query({ limit: 0 });
      expect(events).toHaveLength(0);
    });
  });
});
