/**
 * @votiverse/voting — Ballot method implementations
 *
 * SimpleMajority, Supermajority, RankedChoice, ApprovalVoting.
 * Each implements the BallotMethod interface.
 */

import type { IssueId } from "@votiverse/core";
import type { BallotMethod, WeightedVote, TallyResult } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countVotes(
  votes: readonly WeightedVote[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const choice = typeof vote.choice === "string" ? vote.choice : vote.choice.join(",");
    counts.set(choice, (counts.get(choice) ?? 0) + vote.weight);
  }
  return counts;
}

function totalWeight(votes: readonly WeightedVote[]): number {
  return votes.reduce((sum, v) => sum + v.weight, 0);
}

function checkQuorum(
  participatingWeight: number,
  eligibleCount: number,
  quorum: number,
): boolean {
  if (eligibleCount === 0) return quorum === 0;
  return participatingWeight / eligibleCount >= quorum;
}

function buildResult(
  issueId: IssueId,
  winner: string | null,
  counts: Map<string, number>,
  totalVotes: number,
  quorumMet: boolean,
  quorumThreshold: number,
  eligibleCount: number,
  participatingCount: number,
): TallyResult {
  return {
    issueId,
    winner: quorumMet ? winner : null,
    counts,
    totalVotes,
    quorumMet,
    quorumThreshold,
    eligibleCount,
    participatingCount,
  };
}

// ---------------------------------------------------------------------------
// Simple Majority
// ---------------------------------------------------------------------------

/**
 * Simple majority: the choice with the most weighted votes wins.
 * Tie → no winner.
 */
export class SimpleMajority implements BallotMethod {
  readonly name = "simple-majority";

  tally(
    votes: readonly WeightedVote[],
    issueId: IssueId,
    eligibleCount: number,
    quorum: number,
  ): TallyResult {
    const counts = countVotes(votes);
    const total = totalWeight(votes);
    const quorumMet = checkQuorum(total, eligibleCount, quorum);

    let winner: string | null = null;
    let maxVotes = 0;
    let tied = false;

    for (const [choice, count] of counts) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = choice;
        tied = false;
      } else if (count === maxVotes) {
        tied = true;
      }
    }

    if (tied) winner = null;

    return buildResult(
      issueId,
      winner,
      counts,
      total,
      quorumMet,
      quorum,
      eligibleCount,
      Math.round(total),
    );
  }
}

/**
 * Supermajority: a choice must exceed the threshold percentage of total
 * weighted votes to win.
 */
export class Supermajority implements BallotMethod {
  readonly name = "supermajority";

  constructor(private readonly threshold: number) {
    if (threshold <= 0 || threshold > 1) {
      throw new Error(
        `Supermajority threshold must be between 0 (exclusive) and 1 (inclusive), got ${threshold}`,
      );
    }
  }

  tally(
    votes: readonly WeightedVote[],
    issueId: IssueId,
    eligibleCount: number,
    quorum: number,
  ): TallyResult {
    const counts = countVotes(votes);
    const total = totalWeight(votes);
    const quorumMet = checkQuorum(total, eligibleCount, quorum);

    let winner: string | null = null;

    for (const [choice, count] of counts) {
      if (total > 0 && count / total >= this.threshold) {
        winner = choice;
        break;
      }
    }

    return buildResult(
      issueId,
      winner,
      counts,
      total,
      quorumMet,
      quorum,
      eligibleCount,
      Math.round(total),
    );
  }
}

/**
 * Ranked Choice (Instant Runoff): Votes are ranked lists.
 * The candidate with the fewest first-choice votes is eliminated in
 * rounds until one candidate has a majority.
 */
export class RankedChoice implements BallotMethod {
  readonly name = "ranked-choice";

  tally(
    votes: readonly WeightedVote[],
    issueId: IssueId,
    eligibleCount: number,
    quorum: number,
  ): TallyResult {
    const total = totalWeight(votes);
    const quorumMet = checkQuorum(total, eligibleCount, quorum);

    // Parse ranked votes: each choice should be string[] (ranked options)
    const rankedBallots: { rankings: readonly string[]; weight: number }[] = [];
    for (const vote of votes) {
      const rankings = Array.isArray(vote.choice)
        ? vote.choice
        : [vote.choice as string];
      rankedBallots.push({ rankings, weight: vote.weight });
    }

    // Collect all candidates
    const allCandidates = new Set<string>();
    for (const ballot of rankedBallots) {
      for (const c of ballot.rankings) {
        allCandidates.add(c);
      }
    }

    const eliminated = new Set<string>();
    const majorityThreshold = total / 2;

    // Run elimination rounds
    while (true) {
      // Count first-choice votes (excluding eliminated candidates)
      const roundCounts = new Map<string, number>();
      for (const candidate of allCandidates) {
        if (!eliminated.has(candidate)) {
          roundCounts.set(candidate, 0);
        }
      }

      for (const ballot of rankedBallots) {
        const topChoice = ballot.rankings.find((c) => !eliminated.has(c));
        if (topChoice !== undefined) {
          roundCounts.set(
            topChoice,
            (roundCounts.get(topChoice) ?? 0) + ballot.weight,
          );
        }
      }

      // Check if anyone has a majority
      for (const [choice, count] of roundCounts) {
        if (count > majorityThreshold) {
          return buildResult(
            issueId,
            choice,
            roundCounts,
            total,
            quorumMet,
            quorum,
            eligibleCount,
            Math.round(total),
          );
        }
      }

      // Find the candidate with the fewest votes
      const remaining = [...roundCounts.entries()].filter(
        ([c]) => !eliminated.has(c),
      );
      if (remaining.length <= 1) {
        // Only one candidate left or no candidates
        const winner =
          remaining.length === 1 ? remaining[0]![0] : null;
        return buildResult(
          issueId,
          winner,
          roundCounts,
          total,
          quorumMet,
          quorum,
          eligibleCount,
          Math.round(total),
        );
      }

      // Eliminate the candidate with the fewest votes
      let minVotes = Infinity;
      let toEliminate: string | null = null;
      for (const [choice, count] of remaining) {
        if (count < minVotes) {
          minVotes = count;
          toEliminate = choice;
        }
      }
      if (toEliminate !== null) {
        eliminated.add(toEliminate);
      }
    }
  }
}

/**
 * Approval Voting: Each vote is a set of approved choices.
 * The choice with the most approval weight wins.
 */
export class ApprovalVoting implements BallotMethod {
  readonly name = "approval";

  tally(
    votes: readonly WeightedVote[],
    issueId: IssueId,
    eligibleCount: number,
    quorum: number,
  ): TallyResult {
    const total = totalWeight(votes);
    const quorumMet = checkQuorum(total, eligibleCount, quorum);

    // Each vote approves one or more choices
    const counts = new Map<string, number>();
    for (const vote of votes) {
      const choices = Array.isArray(vote.choice)
        ? vote.choice
        : [vote.choice as string];
      for (const choice of choices) {
        counts.set(choice, (counts.get(choice) ?? 0) + vote.weight);
      }
    }

    // Winner is the choice with the most approvals
    let winner: string | null = null;
    let maxApprovals = 0;
    let tied = false;
    for (const [choice, count] of counts) {
      if (count > maxApprovals) {
        maxApprovals = count;
        winner = choice;
        tied = false;
      } else if (count === maxApprovals) {
        tied = true;
      }
    }

    if (tied) winner = null;

    return buildResult(
      issueId,
      winner,
      counts,
      total,
      quorumMet,
      quorum,
      eligibleCount,
      Math.round(total),
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a BallotMethod instance from the voting method name.
 */
export function createBallotMethod(
  method: string,
  supermajorityThreshold?: number,
): BallotMethod {
  switch (method) {
    case "simple-majority":
      return new SimpleMajority();
    case "supermajority":
      return new Supermajority(supermajorityThreshold ?? 0.67);
    case "ranked-choice":
      return new RankedChoice();
    case "approval":
      return new ApprovalVoting();
    default:
      throw new Error(`Unknown ballot method: ${method}`);
  }
}
