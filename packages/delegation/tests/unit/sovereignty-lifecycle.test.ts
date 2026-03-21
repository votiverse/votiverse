import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, createEvent, generateEventId } from "@votiverse/core";
import type { ParticipantId, TopicId, IssueId, Timestamp, VoteCastEvent } from "@votiverse/core";
import { getPreset } from "@votiverse/config";
import { DelegationService } from "../../src/delegation-service.js";

const pid = (s: string) => s as ParticipantId;
const tid = (s: string) => s as TopicId;

describe("Delegation Sovereignty & Lifecycle", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe("revokedBy in events", () => {
    it("records revokedBy in DelegationRevoked event", async () => {
      const config = getPreset("LIQUID_OPEN");
      const service = new DelegationService(store, config);

      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [tid("finance")],
      });

      await service.revoke({
        sourceId: pid("alice"),
        topicScope: [tid("finance")],
        revokedBy: { kind: "sunset", participantId: pid("admin") },
      });

      const events = await store.getAll();
      const revokeEvent = events.find((e) => e.type === "DelegationRevoked");
      expect(revokeEvent).toBeDefined();
      const payload = revokeEvent!.payload as { revokedBy: { kind: string; participantId?: string } };
      expect(payload.revokedBy.kind).toBe("sunset");
      expect(payload.revokedBy.participantId).toBe("admin");
    });

    it("defaults revokedBy to source when not specified", async () => {
      const config = getPreset("LIQUID_OPEN");
      const service = new DelegationService(store, config);

      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      await service.revoke({
        sourceId: pid("alice"),
        topicScope: [],
      });

      const events = await store.getAll();
      const revokeEvent = events.find((e) => e.type === "DelegationRevoked");
      const payload = revokeEvent!.payload as { revokedBy: { kind: string } };
      expect(payload.revokedBy.kind).toBe("source");
    });
  });
});
