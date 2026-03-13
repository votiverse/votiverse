import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryEventStore,
  createEvent,
  generateEventId,
  generateDelegationId,
} from "@votiverse/core";
import type {
  ParticipantId,
  TopicId,
  IssueId,
  Timestamp,
  DelegationCreatedEvent,
} from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import { VotingService } from "../../src/voting-service.js";

const pid = (s: string) => s as ParticipantId;
const iid = (s: string) => s as IssueId;

let ts = 1000;
function nextTs(): Timestamp {
  return (ts += 100) as Timestamp;
}

function delegationEvent(
  source: string,
  target: string,
): DelegationCreatedEvent {
  return createEvent<DelegationCreatedEvent>(
    "DelegationCreated",
    {
      delegationId: generateDelegationId(),
      sourceId: pid(source),
      targetId: pid(target),
      topicScope: [],
    },
    generateEventId(),
    nextTs(),
  );
}

describe("VotingService", () => {
  let store: InMemoryEventStore;
  let service: VotingService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    service = new VotingService(store, getPreset("LIQUID_STANDARD"));
    ts = 1000;
  });

  describe("cast()", () => {
    it("records a VoteCast event", async () => {
      await service.cast({
        participantId: pid("alice"),
        issueId: iid("issue-1"),
        choice: "for",
      });

      const events = await store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("VoteCast");
    });
  });

  describe("getVotes()", () => {
    it("returns votes for the correct issue", async () => {
      await service.cast({
        participantId: pid("alice"),
        issueId: iid("issue-1"),
        choice: "for",
      });
      await service.cast({
        participantId: pid("bob"),
        issueId: iid("issue-2"),
        choice: "against",
      });

      const votes = await service.getVotes(iid("issue-1"));
      expect(votes).toHaveLength(1);
      expect(votes[0]!.participantId).toBe(pid("alice"));
    });

    it("keeps only the latest vote per participant", async () => {
      await service.cast({
        participantId: pid("alice"),
        issueId: iid("issue-1"),
        choice: "for",
      });
      await service.cast({
        participantId: pid("alice"),
        issueId: iid("issue-1"),
        choice: "against",
      });

      const votes = await service.getVotes(iid("issue-1"));
      expect(votes).toHaveLength(1);
      expect(votes[0]!.choice).toBe("against");
    });
  });

  describe("tally()", () => {
    it("tallies simple majority with no delegations", async () => {
      await service.cast({
        participantId: pid("alice"),
        issueId: iid("issue-1"),
        choice: "for",
      });
      await service.cast({
        participantId: pid("bob"),
        issueId: iid("issue-1"),
        choice: "for",
      });
      await service.cast({
        participantId: pid("carol"),
        issueId: iid("issue-1"),
        choice: "against",
      });

      const result = await service.tally(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob"), pid("carol")]),
      );

      expect(result.winner).toBe("for");
      expect(result.counts.get("for")).toBe(2);
      expect(result.counts.get("against")).toBe(1);
      expect(result.totalVotes).toBe(3);
    });

    it("tallies with delegation weights", async () => {
      // Alice and Bob delegate to Carol
      await store.append(delegationEvent("alice", "carol"));
      await store.append(delegationEvent("bob", "carol"));

      // Carol votes — carries weight 3
      await service.cast({
        participantId: pid("carol"),
        issueId: iid("issue-1"),
        choice: "for",
      });
      // Dave votes — weight 1
      await service.cast({
        participantId: pid("dave"),
        issueId: iid("issue-1"),
        choice: "against",
      });

      const result = await service.tally(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob"), pid("carol"), pid("dave")]),
      );

      expect(result.winner).toBe("for");
      expect(result.counts.get("for")).toBe(3);
      expect(result.counts.get("against")).toBe(1);
    });

    it("applies override rule: direct vote overrides delegation", async () => {
      await store.append(delegationEvent("alice", "bob"));
      // Both vote directly
      await service.cast({
        participantId: pid("alice"),
        issueId: iid("issue-1"),
        choice: "against",
      });
      await service.cast({
        participantId: pid("bob"),
        issueId: iid("issue-1"),
        choice: "for",
      });

      const result = await service.tally(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob")]),
      );

      // Alice overrides her delegation: both have weight 1
      expect(result.counts.get("for")).toBe(1);
      expect(result.counts.get("against")).toBe(1);
      expect(result.winner).toBeNull(); // tie
    });

    it("respects quorum configuration", async () => {
      const highQuorumService = new VotingService(
        store,
        deriveConfig(getPreset("LIQUID_STANDARD"), {
          ballot: { quorum: 0.5 },
        }),
      );

      await highQuorumService.cast({
        participantId: pid("alice"),
        issueId: iid("issue-1"),
        choice: "for",
      });

      // 1 out of 10 eligible participants = 10% < 50% quorum
      const result = await highQuorumService.tally(
        iid("issue-1"),
        [],
        new Set(
          Array.from({ length: 10 }, (_, i) => pid(`p${i}`)).concat([
            pid("alice"),
          ]),
        ),
      );

      expect(result.quorumMet).toBe(false);
      expect(result.winner).toBeNull();
    });

    it("uses supermajority method when configured", async () => {
      const superService = new VotingService(
        store,
        deriveConfig(getPreset("LIQUID_STANDARD"), {
          ballot: {
            votingMethod: "supermajority",
            supermajorityThreshold: 0.67,
          },
        }),
      );

      // 6 for, 4 against = 60% < 67% threshold
      for (let i = 0; i < 6; i++) {
        await superService.cast({
          participantId: pid(`voter-for-${i}`),
          issueId: iid("issue-1"),
          choice: "for",
        });
      }
      for (let i = 0; i < 4; i++) {
        await superService.cast({
          participantId: pid(`voter-against-${i}`),
          issueId: iid("issue-1"),
          choice: "against",
        });
      }

      const allVoters = new Set<ParticipantId>();
      for (let i = 0; i < 6; i++) allVoters.add(pid(`voter-for-${i}`));
      for (let i = 0; i < 4; i++) allVoters.add(pid(`voter-against-${i}`));

      const result = await superService.tally(iid("issue-1"), [], allVoters);
      expect(result.winner).toBeNull(); // 60% < 67%
    });
  });
});
