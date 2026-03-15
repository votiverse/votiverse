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

function delegationEvent(source: string, target: string): DelegationCreatedEvent {
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

      const result = await service.tally(iid("issue-1"), [], new Set([pid("alice"), pid("bob")]));

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
        new Set(Array.from({ length: 10 }, (_, i) => pid(`p${i}`)).concat([pid("alice")])),
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

  describe("participation()", () => {
    it("marks direct voters correctly", async () => {
      await service.cast({ participantId: pid("alice"), issueId: iid("issue-1"), choice: "for" });
      await service.cast({ participantId: pid("bob"), issueId: iid("issue-1"), choice: "against" });

      const records = await service.participation(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob")]),
      );

      const alice = records.find((r) => r.participantId === "alice")!;
      expect(alice.status).toBe("direct");
      expect(alice.effectiveChoice).toBe("for");
      expect(alice.delegateId).toBeNull();
      expect(alice.terminalVoterId).toBe("alice");
      expect(alice.chain).toEqual([]);

      const bob = records.find((r) => r.participantId === "bob")!;
      expect(bob.status).toBe("direct");
      expect(bob.effectiveChoice).toBe("against");
    });

    it("marks delegated participants with chain and effective choice", async () => {
      // Alice → Bob delegation, Bob votes
      await store.append(delegationEvent("alice", "bob"));
      await service.cast({ participantId: pid("bob"), issueId: iid("issue-1"), choice: "for" });

      const records = await service.participation(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob")]),
      );

      const alice = records.find((r) => r.participantId === "alice")!;
      expect(alice.status).toBe("delegated");
      expect(alice.effectiveChoice).toBe("for"); // Bob's choice
      expect(alice.delegateId).toBe("bob");
      expect(alice.terminalVoterId).toBe("bob");
      expect(alice.chain).toEqual(["bob"]);

      const bob = records.find((r) => r.participantId === "bob")!;
      expect(bob.status).toBe("direct");
    });

    it("resolves transitive delegation chains", async () => {
      // Alice → Bob → Carol, Carol votes
      await store.append(delegationEvent("alice", "bob"));
      await store.append(delegationEvent("bob", "carol"));
      await service.cast({ participantId: pid("carol"), issueId: iid("issue-1"), choice: "against" });

      const records = await service.participation(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob"), pid("carol")]),
      );

      const alice = records.find((r) => r.participantId === "alice")!;
      expect(alice.status).toBe("delegated");
      expect(alice.effectiveChoice).toBe("against");
      expect(alice.delegateId).toBe("bob");
      expect(alice.terminalVoterId).toBe("carol");
      expect(alice.chain).toEqual(["bob", "carol"]);

      const bob = records.find((r) => r.participantId === "bob")!;
      expect(bob.status).toBe("delegated");
      expect(bob.delegateId).toBe("carol");
      expect(bob.terminalVoterId).toBe("carol");
      expect(bob.chain).toEqual(["carol"]);
    });

    it("marks absent participants", async () => {
      await service.cast({ participantId: pid("alice"), issueId: iid("issue-1"), choice: "for" });

      const records = await service.participation(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob")]),
      );

      const bob = records.find((r) => r.participantId === "bob")!;
      expect(bob.status).toBe("absent");
      expect(bob.effectiveChoice).toBeNull();
      expect(bob.delegateId).toBeNull();
      expect(bob.terminalVoterId).toBeNull();
      expect(bob.chain).toEqual([]);
    });

    it("applies override rule: direct vote makes status 'direct'", async () => {
      // Alice delegates to Bob, but also votes directly
      await store.append(delegationEvent("alice", "bob"));
      await service.cast({ participantId: pid("alice"), issueId: iid("issue-1"), choice: "against" });
      await service.cast({ participantId: pid("bob"), issueId: iid("issue-1"), choice: "for" });

      const records = await service.participation(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob")]),
      );

      const alice = records.find((r) => r.participantId === "alice")!;
      expect(alice.status).toBe("direct");
      expect(alice.effectiveChoice).toBe("against"); // her own choice
      expect(alice.delegateId).toBeNull();
    });

    it("marks delegation to non-voter as absent", async () => {
      // Alice delegates to Bob, but Bob doesn't vote
      await store.append(delegationEvent("alice", "bob"));

      const records = await service.participation(
        iid("issue-1"),
        [],
        new Set([pid("alice"), pid("bob")]),
      );

      const alice = records.find((r) => r.participantId === "alice")!;
      expect(alice.status).toBe("absent");
      expect(alice.effectiveChoice).toBeNull();
      expect(alice.terminalVoterId).toBeNull();

      const bob = records.find((r) => r.participantId === "bob")!;
      expect(bob.status).toBe("absent");
    });

    it("returns one record per eligible participant", async () => {
      const eligible = new Set([pid("a"), pid("b"), pid("c"), pid("d"), pid("e")]);
      await service.cast({ participantId: pid("a"), issueId: iid("issue-1"), choice: "for" });

      const records = await service.participation(iid("issue-1"), [], eligible);
      expect(records).toHaveLength(5);
      const pids = records.map((r) => r.participantId).sort();
      expect(pids).toEqual(["a", "b", "c", "d", "e"]);
    });
  });
});
