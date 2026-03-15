import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, ValidationError } from "@votiverse/core";
import type { ParticipantId, IssueId } from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import { VotingService } from "../../src/voting-service.js";

const pid = (s: string) => s as ParticipantId;
const iid = (s: string) => s as IssueId;

const CANDIDATES = ["Alice Johnson", "Bob Smith", "Carol Davis"] as const;

describe("Multi-option ballot support", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe("choice validation", () => {
    let service: VotingService;

    beforeEach(() => {
      service = new VotingService(store, getPreset("TOWN_HALL"));
    });

    it("accepts a valid declared choice", async () => {
      await service.cast({
        participantId: pid("voter-1"),
        issueId: iid("election-1"),
        choice: "Alice Johnson",
        issueChoices: CANDIDATES,
      });

      const votes = await service.getVotes(iid("election-1"));
      expect(votes).toHaveLength(1);
      expect(votes[0]!.choice).toBe("Alice Johnson");
    });

    it("rejects a choice not in declared options", async () => {
      await expect(
        service.cast({
          participantId: pid("voter-1"),
          issueId: iid("election-1"),
          choice: "Unknown Candidate",
          issueChoices: CANDIDATES,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("always accepts 'abstain' even with declared choices", async () => {
      await service.cast({
        participantId: pid("voter-1"),
        issueId: iid("election-1"),
        choice: "abstain",
        issueChoices: CANDIDATES,
      });

      const votes = await service.getVotes(iid("election-1"));
      expect(votes).toHaveLength(1);
      expect(votes[0]!.choice).toBe("abstain");
    });

    it("accepts any string when no choices are declared (backward compat)", async () => {
      await service.cast({
        participantId: pid("voter-1"),
        issueId: iid("issue-1"),
        choice: "for",
      });

      await service.cast({
        participantId: pid("voter-2"),
        issueId: iid("issue-1"),
        choice: "some-custom-value",
      });

      const votes = await service.getVotes(iid("issue-1"));
      expect(votes).toHaveLength(2);
    });
  });

  describe("ranked-choice with declared choices", () => {
    let service: VotingService;

    beforeEach(() => {
      service = new VotingService(
        store,
        deriveConfig(getPreset("TOWN_HALL"), {
          ballot: { votingMethod: "ranked-choice" },
        }),
      );
    });

    it("accepts a valid ranking of declared choices", async () => {
      await service.cast({
        participantId: pid("voter-1"),
        issueId: iid("election-1"),
        choice: ["Carol Davis", "Alice Johnson", "Bob Smith"],
        issueChoices: CANDIDATES,
      });

      const votes = await service.getVotes(iid("election-1"));
      expect(votes).toHaveLength(1);
    });

    it("accepts a partial ranking (not all candidates ranked)", async () => {
      await service.cast({
        participantId: pid("voter-1"),
        issueId: iid("election-1"),
        choice: ["Alice Johnson"],
        issueChoices: CANDIDATES,
      });

      const votes = await service.getVotes(iid("election-1"));
      expect(votes).toHaveLength(1);
    });

    it("rejects a ranking containing an invalid candidate", async () => {
      await expect(
        service.cast({
          participantId: pid("voter-1"),
          issueId: iid("election-1"),
          choice: ["Alice Johnson", "Invalid Person", "Bob Smith"],
          issueChoices: CANDIDATES,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("tallies ranked-choice election correctly", async () => {
      // 3 voters: Carol wins after eliminating Bob
      await service.cast({
        participantId: pid("v1"),
        issueId: iid("election-1"),
        choice: ["Alice Johnson", "Carol Davis"],
        issueChoices: CANDIDATES,
      });
      await service.cast({
        participantId: pid("v2"),
        issueId: iid("election-1"),
        choice: ["Carol Davis", "Alice Johnson"],
        issueChoices: CANDIDATES,
      });
      await service.cast({
        participantId: pid("v3"),
        issueId: iid("election-1"),
        choice: ["Bob Smith", "Carol Davis"],
        issueChoices: CANDIDATES,
      });

      const result = await service.tally(
        iid("election-1"),
        [],
        new Set([pid("v1"), pid("v2"), pid("v3")]),
      );

      // Bob eliminated first (1 vote), his vote transfers to Carol.
      // Carol gets 2 votes > majority threshold of 1.5 → Carol wins.
      expect(result.winner).toBe("Carol Davis");
    });
  });

  describe("approval voting with declared choices", () => {
    let service: VotingService;

    beforeEach(() => {
      service = new VotingService(
        store,
        deriveConfig(getPreset("TOWN_HALL"), {
          ballot: { votingMethod: "approval" },
        }),
      );
    });

    it("accepts approval of multiple declared choices", async () => {
      await service.cast({
        participantId: pid("voter-1"),
        issueId: iid("election-1"),
        choice: ["Alice Johnson", "Carol Davis"],
        issueChoices: CANDIDATES,
      });

      const votes = await service.getVotes(iid("election-1"));
      expect(votes).toHaveLength(1);
    });

    it("rejects approval containing an invalid choice", async () => {
      await expect(
        service.cast({
          participantId: pid("voter-1"),
          issueId: iid("election-1"),
          choice: ["Alice Johnson", "Fake Person"],
          issueChoices: CANDIDATES,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("tallies approval election correctly", async () => {
      // v1 approves Alice + Carol, v2 approves Bob + Carol, v3 approves Alice
      await service.cast({
        participantId: pid("v1"),
        issueId: iid("election-1"),
        choice: ["Alice Johnson", "Carol Davis"],
        issueChoices: CANDIDATES,
      });
      await service.cast({
        participantId: pid("v2"),
        issueId: iid("election-1"),
        choice: ["Bob Smith", "Carol Davis"],
        issueChoices: CANDIDATES,
      });
      await service.cast({
        participantId: pid("v3"),
        issueId: iid("election-1"),
        choice: ["Alice Johnson"],
        issueChoices: CANDIDATES,
      });

      const result = await service.tally(
        iid("election-1"),
        [],
        new Set([pid("v1"), pid("v2"), pid("v3")]),
      );

      // Alice: 2 approvals, Carol: 2 approvals, Bob: 1 approval → tie between Alice and Carol
      expect(result.winner).toBeNull(); // tie
      expect(result.counts.get("Alice Johnson")).toBe(2);
      expect(result.counts.get("Carol Davis")).toBe(2);
      expect(result.counts.get("Bob Smith")).toBe(1);
    });
  });

  describe("simple majority with named choices", () => {
    let service: VotingService;

    beforeEach(() => {
      service = new VotingService(store, getPreset("TOWN_HALL"));
    });

    it("tallies simple majority with named candidates", async () => {
      await service.cast({
        participantId: pid("v1"),
        issueId: iid("election-1"),
        choice: "Alice Johnson",
        issueChoices: CANDIDATES,
      });
      await service.cast({
        participantId: pid("v2"),
        issueId: iid("election-1"),
        choice: "Alice Johnson",
        issueChoices: CANDIDATES,
      });
      await service.cast({
        participantId: pid("v3"),
        issueId: iid("election-1"),
        choice: "Bob Smith",
        issueChoices: CANDIDATES,
      });

      const result = await service.tally(
        iid("election-1"),
        [],
        new Set([pid("v1"), pid("v2"), pid("v3")]),
      );

      expect(result.winner).toBe("Alice Johnson");
      expect(result.counts.get("Alice Johnson")).toBe(2);
      expect(result.counts.get("Bob Smith")).toBe(1);
    });
  });
});
