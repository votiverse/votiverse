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
  VoteCastEvent,
} from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import { AwarenessService } from "../../src/awareness-service.js";
import type { IssueContext } from "../../src/awareness-service.js";

const pid = (s: string) => s as ParticipantId;
const tid = (s: string) => s as TopicId;
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

function voteEvent(participant: string, issue: string): VoteCastEvent {
  return createEvent<VoteCastEvent>(
    "VoteCast",
    {
      participantId: pid(participant),
      issueId: iid(issue),
      choice: "for",
    },
    generateEventId(),
    nextTs(),
  );
}

function makeContext(
  issueId: string,
  participants: string[],
): IssueContext {
  return {
    issueId: iid(issueId),
    issueTitle: `Issue ${issueId}`,
    topicIds: [],
    eligibleParticipantIds: participants.map(pid),
    topicAncestors: new Map(),
  };
}

describe("AwarenessService", () => {
  let store: InMemoryEventStore;
  let service: AwarenessService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    service = new AwarenessService(
      store,
      deriveConfig(getPreset("LIQUID_STANDARD"), {
        thresholds: { concentrationAlertThreshold: 0.3 },
      }),
    );
    ts = 1000;
  });

  describe("concentration()", () => {
    it("detects concentration above threshold", async () => {
      // Alice, Bob, Carol all delegate to Dave
      await store.append(delegationEvent("alice", "dave"));
      await store.append(delegationEvent("bob", "dave"));
      await store.append(delegationEvent("carol", "dave"));
      // Dave votes
      await store.append(voteEvent("dave", "issue-1"));

      const ctx = makeContext("issue-1", [
        "alice",
        "bob",
        "carol",
        "dave",
        "eve",
      ]);
      const report = await service.concentration(ctx);

      expect(report.hasAlerts).toBe(true);
      expect(report.alerts).toHaveLength(1);
      expect(report.alerts[0]!.delegateId).toBe(pid("dave"));
      // Dave has weight 4 out of 5 eligible = 80% > 30% threshold
      expect(report.alerts[0]!.weight).toBe(4);
      expect(report.alerts[0]!.weightFraction).toBeCloseTo(0.8);
    });

    it("no alerts when weight is evenly distributed", async () => {
      // With 5 voters each having weight 1, fraction = 0.2 < 0.3 threshold
      await store.append(voteEvent("alice", "issue-1"));
      await store.append(voteEvent("bob", "issue-1"));
      await store.append(voteEvent("carol", "issue-1"));
      await store.append(voteEvent("dave", "issue-1"));
      await store.append(voteEvent("eve", "issue-1"));

      const ctx = makeContext("issue-1", [
        "alice", "bob", "carol", "dave", "eve",
      ]);
      const report = await service.concentration(ctx);

      expect(report.hasAlerts).toBe(false);
      expect(report.giniCoefficient).toBeCloseTo(0);
    });
  });

  describe("chain()", () => {
    it("resolves delegation chain", async () => {
      await store.append(delegationEvent("alice", "bob"));
      await store.append(delegationEvent("bob", "carol"));
      await store.append(voteEvent("carol", "issue-1"));

      const ctx = makeContext("issue-1", ["alice", "bob", "carol"]);
      const chain = await service.chain(pid("alice"), ctx);

      expect(chain.terminalVoter).toBe(pid("carol"));
      expect(chain.chain).toEqual([pid("alice"), pid("bob"), pid("carol")]);
    });

    it("shows direct voter chain", async () => {
      await store.append(voteEvent("alice", "issue-1"));

      const ctx = makeContext("issue-1", ["alice"]);
      const chain = await service.chain(pid("alice"), ctx);

      expect(chain.votedDirectly).toBe(true);
      expect(chain.terminalVoter).toBe(pid("alice"));
    });
  });

  describe("delegateProfile()", () => {
    it("builds a delegate profile", async () => {
      await store.append(delegationEvent("alice", "bob"));
      await store.append(delegationEvent("carol", "bob"));
      await store.append(voteEvent("bob", "issue-1"));

      const ctx = makeContext("issue-1", ["alice", "bob", "carol"]);
      const profile = await service.delegateProfile(pid("bob"), [ctx]);

      expect(profile.delegateId).toBe(pid("bob"));
      expect(profile.currentDelegatorCount).toBe(2);
      expect(profile.totalVotesCast).toBe(1);
    });
  });

  describe("prompts()", () => {
    it("generates concentration alert for delegators", async () => {
      await store.append(delegationEvent("alice", "dave"));
      await store.append(delegationEvent("bob", "dave"));
      await store.append(delegationEvent("carol", "dave"));
      await store.append(voteEvent("dave", "issue-1"));

      const ctx = makeContext("issue-1", [
        "alice",
        "bob",
        "carol",
        "dave",
        "eve",
      ]);
      const prompts = await service.prompts(pid("alice"), ctx);

      expect(prompts.length).toBeGreaterThanOrEqual(1);
      expect(
        prompts.some((p) => p.reason === "concentration-alert"),
      ).toBe(true);
    });

    it("returns no prompts for direct voters", async () => {
      await store.append(voteEvent("alice", "issue-1"));

      const ctx = makeContext("issue-1", ["alice"]);
      const prompts = await service.prompts(pid("alice"), ctx);

      expect(prompts).toHaveLength(0);
    });

    it("warns when delegation chain is unresolved", async () => {
      // Alice delegates to Bob, but Bob doesn't vote
      await store.append(delegationEvent("alice", "bob"));

      const ctx = makeContext("issue-1", ["alice", "bob"]);
      const prompts = await service.prompts(pid("alice"), ctx);

      expect(
        prompts.some((p) => p.reason === "delegate-behavior-anomaly"),
      ).toBe(true);
    });
  });

  describe("votingHistory()", () => {
    it("compiles voting history for a participant", async () => {
      await store.append(voteEvent("alice", "issue-1"));
      await store.append(delegationEvent("alice", "bob"));
      await store.append(voteEvent("bob", "issue-2"));

      const contexts = [
        makeContext("issue-1", ["alice", "bob"]),
        makeContext("issue-2", ["alice", "bob"]),
      ];
      const history = await service.votingHistory(pid("alice"), contexts);

      expect(history.entries).toHaveLength(2);
      expect(history.totalDirect).toBe(1);
      expect(history.totalDelegated).toBe(1);

      // First issue: Alice voted directly
      const entry1 = history.entries.find((e) => e.issueId === iid("issue-1"));
      expect(entry1!.votedDirectly).toBe(true);

      // Second issue: Alice delegated to Bob
      const entry2 = history.entries.find((e) => e.issueId === iid("issue-2"));
      expect(entry2!.votedDirectly).toBe(false);
      expect(entry2!.delegateId).toBe(pid("bob"));
    });
  });

  describe("context()", () => {
    it("finds related decisions by topic overlap", async () => {
      const ctx1: IssueContext = {
        issueId: iid("past-issue"),
        issueTitle: "Past Education Decision",
        topicIds: [tid("education")],
        eligibleParticipantIds: [],
        topicAncestors: new Map(),
      };
      const ctx2: IssueContext = {
        issueId: iid("current-issue"),
        issueTitle: "New Education Proposal",
        topicIds: [tid("education")],
        eligibleParticipantIds: [],
        topicAncestors: new Map(),
      };

      const result = await service.context(ctx2, [ctx1]);

      expect(result.relatedDecisions).toHaveLength(1);
      expect(result.relatedDecisions[0]!.issueTitle).toBe(
        "Past Education Decision",
      );
    });

    it("excludes unrelated topics", async () => {
      const ctx1: IssueContext = {
        issueId: iid("finance-issue"),
        issueTitle: "Finance Decision",
        topicIds: [tid("finance")],
        eligibleParticipantIds: [],
        topicAncestors: new Map(),
      };
      const ctx2: IssueContext = {
        issueId: iid("education-issue"),
        issueTitle: "Education Proposal",
        topicIds: [tid("education")],
        eligibleParticipantIds: [],
        topicAncestors: new Map(),
      };

      const result = await service.context(ctx2, [ctx1]);
      expect(result.relatedDecisions).toHaveLength(0);
    });
  });
});
