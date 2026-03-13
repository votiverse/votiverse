import { describe, it, expect } from "vitest";
import type { IssueId } from "@votiverse/core";
import {
  SimpleMajority,
  Supermajority,
  RankedChoice,
  ApprovalVoting,
  createBallotMethod,
} from "../../src/ballot-methods.js";
import type { WeightedVote } from "../../src/types.js";

const issue = "issue-1" as IssueId;

describe("SimpleMajority", () => {
  const method = new SimpleMajority();

  it("selects the choice with the most weighted votes", () => {
    const votes: WeightedVote[] = [
      { choice: "for", weight: 3 },
      { choice: "against", weight: 2 },
    ];
    const result = method.tally(votes, issue, 5, 0);
    expect(result.winner).toBe("for");
    expect(result.counts.get("for")).toBe(3);
    expect(result.counts.get("against")).toBe(2);
    expect(result.totalVotes).toBe(5);
  });

  it("returns null winner on tie", () => {
    const votes: WeightedVote[] = [
      { choice: "for", weight: 3 },
      { choice: "against", weight: 3 },
    ];
    const result = method.tally(votes, issue, 6, 0);
    expect(result.winner).toBeNull();
  });

  it("respects quorum", () => {
    const votes: WeightedVote[] = [{ choice: "for", weight: 1 }];
    const result = method.tally(votes, issue, 10, 0.5);
    expect(result.quorumMet).toBe(false);
    expect(result.winner).toBeNull();
  });

  it("handles empty votes", () => {
    const result = method.tally([], issue, 5, 0);
    expect(result.winner).toBeNull();
    expect(result.totalVotes).toBe(0);
  });

  it("quorum met when enough participation", () => {
    const votes: WeightedVote[] = [
      { choice: "for", weight: 5 },
      { choice: "against", weight: 3 },
    ];
    const result = method.tally(votes, issue, 10, 0.5);
    expect(result.quorumMet).toBe(true);
    expect(result.winner).toBe("for");
  });

  it("handles weighted votes correctly with delegations", () => {
    // Bob votes "for" with weight 3 (his own + 2 delegators)
    // Carol votes "against" with weight 2
    const votes: WeightedVote[] = [
      { choice: "for", weight: 3 },
      { choice: "against", weight: 2 },
    ];
    const result = method.tally(votes, issue, 5, 0);
    expect(result.winner).toBe("for");
    expect(result.totalVotes).toBe(5);
  });
});

describe("Supermajority", () => {
  it("requires threshold percentage to win", () => {
    const method = new Supermajority(0.67);
    const votes: WeightedVote[] = [
      { choice: "for", weight: 6 },
      { choice: "against", weight: 4 },
    ];
    const result = method.tally(votes, issue, 10, 0);
    // 6/10 = 0.6 < 0.67, no winner
    expect(result.winner).toBeNull();
  });

  it("declares winner when threshold is met", () => {
    const method = new Supermajority(0.67);
    const votes: WeightedVote[] = [
      { choice: "for", weight: 7 },
      { choice: "against", weight: 3 },
    ];
    const result = method.tally(votes, issue, 10, 0);
    // 7/10 = 0.7 >= 0.67
    expect(result.winner).toBe("for");
  });

  it("throws for invalid threshold", () => {
    expect(() => new Supermajority(0)).toThrow();
    expect(() => new Supermajority(1.5)).toThrow();
  });

  it("works with threshold of 1.0 (unanimity)", () => {
    const method = new Supermajority(1.0);
    const votes: WeightedVote[] = [{ choice: "for", weight: 10 }];
    const result = method.tally(votes, issue, 10, 0);
    expect(result.winner).toBe("for");
  });
});

describe("RankedChoice", () => {
  const method = new RankedChoice();

  it("selects first-choice majority winner immediately", () => {
    const votes: WeightedVote[] = [
      { choice: ["alice", "bob"], weight: 6 },
      { choice: ["bob", "alice"], weight: 4 },
    ];
    const result = method.tally(votes, issue, 10, 0);
    expect(result.winner).toBe("alice");
  });

  it("eliminates candidates in rounds", () => {
    const votes: WeightedVote[] = [
      { choice: ["alice", "carol"], weight: 4 },
      { choice: ["bob", "carol"], weight: 2 },
      { choice: ["carol", "alice"], weight: 4 },
    ];
    const result = method.tally(votes, issue, 10, 0);
    // Round 1: alice=4, carol=4, bob=2. Bob eliminated (fewest votes).
    // Round 2: bob's voters prefer carol. carol=4+2=6 > 5 (majority). Carol wins.
    expect(result.winner).toBe("carol");
  });

  it("handles single candidate", () => {
    const votes: WeightedVote[] = [{ choice: ["only"], weight: 5 }];
    const result = method.tally(votes, issue, 5, 0);
    expect(result.winner).toBe("only");
  });
});

describe("ApprovalVoting", () => {
  const method = new ApprovalVoting();

  it("selects the most approved choice", () => {
    const votes: WeightedVote[] = [
      { choice: ["alice", "bob"], weight: 3 },
      { choice: ["bob", "carol"], weight: 2 },
      { choice: ["carol"], weight: 1 },
    ];
    const result = method.tally(votes, issue, 6, 0);
    // alice: 3, bob: 5, carol: 3
    expect(result.winner).toBe("bob");
  });

  it("returns null on tie", () => {
    const votes: WeightedVote[] = [
      { choice: ["alice"], weight: 3 },
      { choice: ["bob"], weight: 3 },
    ];
    const result = method.tally(votes, issue, 6, 0);
    expect(result.winner).toBeNull();
  });
});

describe("createBallotMethod factory", () => {
  it("creates SimpleMajority", () => {
    const method = createBallotMethod("simple-majority");
    expect(method.name).toBe("simple-majority");
  });

  it("creates Supermajority with threshold", () => {
    const method = createBallotMethod("supermajority", 0.75);
    expect(method.name).toBe("supermajority");
  });

  it("creates RankedChoice", () => {
    const method = createBallotMethod("ranked-choice");
    expect(method.name).toBe("ranked-choice");
  });

  it("creates ApprovalVoting", () => {
    const method = createBallotMethod("approval");
    expect(method.name).toBe("approval");
  });

  it("throws for unknown method", () => {
    expect(() => createBallotMethod("unknown")).toThrow();
  });
});
