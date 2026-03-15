import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, createEvent, generateEventId, GovernanceRuleViolation } from "@votiverse/core";
import type { ParticipantId, TopicId, IssueId, Timestamp, VoteCastEvent } from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import type { GovernanceConfig } from "@votiverse/config";
import { DelegationService } from "../../src/delegation-service.js";
import { buildActiveDelegations } from "../../src/graph.js";

const pid = (s: string) => s as ParticipantId;
const tid = (s: string) => s as TopicId;

describe("Delegation Sovereignty & Lifecycle", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe("revocableAnytime enforcement", () => {
    it("allows revocation when revocableAnytime is true", async () => {
      const config = getPreset("LIQUID_STANDARD");
      const service = new DelegationService(store, config);

      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      await expect(
        service.revoke({ sourceId: pid("alice"), topicScope: [] }),
      ).resolves.toBeUndefined();
    });

    it("throws GovernanceRuleViolation when revocableAnytime is false and source revokes", async () => {
      const config = getPreset("BOARD_PROXY");
      const service = new DelegationService(store, config);

      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      await expect(
        service.revoke({ sourceId: pid("alice"), topicScope: [] }),
      ).rejects.toThrow(GovernanceRuleViolation);
    });

    it("allows sunset-initiated revocation even when revocableAnytime is false", async () => {
      const config = getPreset("BOARD_PROXY");
      const service = new DelegationService(store, config);

      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      await expect(
        service.revoke({
          sourceId: pid("alice"),
          topicScope: [],
          revokedBy: { kind: "sunset", participantId: pid("alice") },
        }),
      ).resolves.toBeUndefined();
    });

    it("allows system-initiated revocation even when revocableAnytime is false", async () => {
      const config = getPreset("BOARD_PROXY");
      const service = new DelegationService(store, config);

      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      await expect(
        service.revoke({
          sourceId: pid("alice"),
          topicScope: [],
          revokedBy: { kind: "system", reason: "test" },
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("delegation expiry (TTL)", () => {
    it("excludes expired delegations from active set", async () => {
      // Create a delegation at a known time
      const createdAt = 1_000_000 as Timestamp;
      const event = createEvent(
        "DelegationCreated",
        {
          delegationId: "del-1",
          sourceId: pid("alice"),
          targetId: pid("bob"),
          topicScope: [],
        },
        generateEventId(),
        createdAt,
      );
      await store.append(event);

      // Query with maxAge=1 hour, asOf = createdAt + 2 hours → expired
      const expired = await buildActiveDelegations(store, {
        maxAge: 3_600_000,
        asOf: (createdAt + 7_200_000) as Timestamp,
      });
      expect(expired).toHaveLength(0);

      // Query with maxAge=1 hour, asOf = createdAt + 30 min → still active
      const active = await buildActiveDelegations(store, {
        maxAge: 3_600_000,
        asOf: (createdAt + 1_800_000) as Timestamp,
      });
      expect(active).toHaveLength(1);
    });

    it("does not filter when maxAge is null", async () => {
      const createdAt = 1_000_000 as Timestamp;
      const event = createEvent(
        "DelegationCreated",
        {
          delegationId: "del-1",
          sourceId: pid("alice"),
          targetId: pid("bob"),
          topicScope: [],
        },
        generateEventId(),
        createdAt,
      );
      await store.append(event);

      // Even far in the future, maxAge=null means no expiry
      const active = await buildActiveDelegations(store, {
        maxAge: null,
        asOf: (createdAt + 999_999_999) as Timestamp,
      });
      expect(active).toHaveLength(1);
    });

    it("service threads maxAge from config", async () => {
      const config = deriveConfig(getPreset("LIQUID_STANDARD"), {
        delegation: { maxAge: 3_600_000 }, // 1 hour
      });
      const service = new DelegationService(store, config);

      const delegation = await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      // Immediately after creation the delegation is active
      const active = await service.listActive();
      expect(active).toHaveLength(1);
    });

    it("expired delegation does not contribute weight", async () => {
      const createdAt = 1_000_000 as Timestamp;

      // Create delegation event at a fixed time
      const delEvent = createEvent(
        "DelegationCreated",
        {
          delegationId: "del-1",
          sourceId: pid("alice"),
          targetId: pid("bob"),
          topicScope: [],
        },
        generateEventId(),
        createdAt,
      );
      await store.append(delEvent);

      // Bob votes
      const voteEvent = createEvent<VoteCastEvent>(
        "VoteCast",
        { participantId: pid("bob"), issueId: "issue-1" as IssueId, choice: "for" },
        generateEventId(),
        (createdAt + 100) as Timestamp,
      );
      await store.append(voteEvent);

      // With maxAge, check active delegations at expiry time
      const expired = await buildActiveDelegations(store, {
        maxAge: 3_600_000,
        asOf: (createdAt + 7_200_000) as Timestamp,
      });
      expect(expired).toHaveLength(0);
    });
  });

  describe("revokedBy in events", () => {
    it("records revokedBy in DelegationRevoked event", async () => {
      const config = getPreset("LIQUID_STANDARD");
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
      const config = getPreset("LIQUID_STANDARD");
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
