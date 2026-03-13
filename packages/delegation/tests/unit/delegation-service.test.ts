import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, createEvent, generateEventId, ValidationError } from "@votiverse/core";
import type { ParticipantId, TopicId, IssueId, Timestamp, VoteCastEvent } from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import type { GovernanceConfig } from "@votiverse/config";
import { DelegationService } from "../../src/delegation-service.js";

const pid = (s: string) => s as ParticipantId;
const tid = (s: string) => s as TopicId;
const iid = (s: string) => s as IssueId;

describe("DelegationService", () => {
  let store: InMemoryEventStore;
  let service: DelegationService;
  let config: GovernanceConfig;

  beforeEach(() => {
    store = new InMemoryEventStore();
    config = getPreset("LIQUID_STANDARD");
    service = new DelegationService(store, config);
  });

  describe("create()", () => {
    it("creates a delegation and records an event", async () => {
      const delegation = await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [tid("finance")],
      });

      expect(delegation.sourceId).toBe(pid("alice"));
      expect(delegation.targetId).toBe(pid("bob"));
      expect(delegation.active).toBe(true);

      const events = await store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("DelegationCreated");
    });

    it("throws when delegation is disabled", async () => {
      const noDelConfig = getPreset("TOWN_HALL");
      const noDelService = new DelegationService(store, noDelConfig);

      await expect(
        noDelService.create({
          sourceId: pid("alice"),
          targetId: pid("bob"),
          topicScope: [],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws when delegating to yourself", async () => {
      await expect(
        service.create({
          sourceId: pid("alice"),
          targetId: pid("alice"),
          topicScope: [],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("enforces max delegates per participant", async () => {
      const limitedConfig = deriveConfig(config, {
        delegation: { maxDelegatesPerParticipant: 1 },
      });
      const limitedService = new DelegationService(store, limitedConfig);

      await limitedService.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [tid("finance")],
      });

      await expect(
        limitedService.create({
          sourceId: pid("alice"),
          targetId: pid("carol"),
          topicScope: [tid("health")],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("revoke()", () => {
    it("revokes an active delegation", async () => {
      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [tid("finance")],
      });

      await service.revoke({
        sourceId: pid("alice"),
        topicScope: [tid("finance")],
      });

      const active = await service.listActive(pid("alice"));
      expect(active).toHaveLength(0);
    });

    it("throws when no matching delegation found", async () => {
      await expect(
        service.revoke({
          sourceId: pid("alice"),
          topicScope: [tid("finance")],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("listActive()", () => {
    it("returns all active delegations", async () => {
      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });
      await service.create({
        sourceId: pid("carol"),
        targetId: pid("dave"),
        topicScope: [],
      });

      const all = await service.listActive();
      expect(all).toHaveLength(2);
    });

    it("filters by source participant", async () => {
      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });
      await service.create({
        sourceId: pid("carol"),
        targetId: pid("dave"),
        topicScope: [],
      });

      const aliceOnly = await service.listActive(pid("alice"));
      expect(aliceOnly).toHaveLength(1);
      expect(aliceOnly[0]!.sourceId).toBe(pid("alice"));
    });
  });

  describe("computeWeights()", () => {
    it("computes weights with delegations", async () => {
      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      await store.append(
        createEvent<VoteCastEvent>(
          "VoteCast",
          { participantId: pid("bob"), issueId: iid("issue-1"), choice: "for" },
          generateEventId(),
          1000000 as Timestamp,
        ),
      );

      const weights = await service.computeWeights(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob")]),
      );

      expect(weights.weights.get(pid("bob"))).toBe(2);
      expect(weights.totalWeight).toBe(2);
    });
  });

  describe("resolveChain()", () => {
    it("resolves a delegation chain", async () => {
      await service.create({
        sourceId: pid("alice"),
        targetId: pid("bob"),
        topicScope: [],
      });

      await store.append(
        createEvent<VoteCastEvent>(
          "VoteCast",
          { participantId: pid("bob"), issueId: iid("issue-1"), choice: "for" },
          generateEventId(),
          1000000 as Timestamp,
        ),
      );

      const chain = await service.resolveChain(pid("alice"), iid("issue-1"), []);

      expect(chain.terminalVoter).toBe(pid("bob"));
      expect(chain.chain).toEqual([pid("alice"), pid("bob")]);
    });
  });
});
