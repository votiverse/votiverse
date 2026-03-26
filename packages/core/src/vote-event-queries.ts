/**
 * @votiverse/core — Vote event query utilities
 *
 * Single source of truth for computing active votes from the event log.
 * Replays VoteCast + VoteRetracted events and returns deduplicated results.
 *
 * Lives in core so that both @votiverse/voting and @votiverse/delegation
 * can share the same implementation without circular dependencies.
 */

import type { EventStore } from "./event-store.js";
import type { ParticipantId, IssueId, VoteChoice, Timestamp } from "./types.js";
import type { VoteCastEvent } from "./events.js";

/** An active (non-retracted) vote from the event log. */
export interface ActiveVote {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  readonly choice: VoteChoice;
  readonly timestamp: number;
}

/**
 * Replay VoteCast + VoteRetracted events to compute the set of active votes.
 *
 * Events are processed in sequence order. A VoteRetracted removes the
 * corresponding VoteCast. A subsequent VoteCast re-establishes the vote.
 *
 * @param eventStore - The event store to query.
 * @param filter - Optional filters. All filters are ANDed.
 *   - `before`: only consider events with timestamp < before (point-in-time snapshot)
 */
export async function getActiveVotes(
  eventStore: EventStore,
  filter?: { issueId?: IssueId; participantId?: ParticipantId; before?: Timestamp },
): Promise<readonly ActiveVote[]> {
  const events = await eventStore.query({
    types: ["VoteCast", "VoteRetracted"],
    ...(filter?.before !== undefined ? { before: filter.before } : {}),
  });
  const active = new Map<string, ActiveVote>();

  for (const e of events) {
    const payload = e.payload as { participantId: string; issueId: string; choice?: VoteChoice };
    if (filter?.issueId && payload.issueId !== filter.issueId) continue;
    if (filter?.participantId && payload.participantId !== filter.participantId) continue;

    const key = `${payload.participantId}:${payload.issueId}`;
    if (e.type === "VoteCast") {
      active.set(key, {
        participantId: payload.participantId as ParticipantId,
        issueId: payload.issueId as IssueId,
        choice: (e as VoteCastEvent).payload.choice,
        timestamp: e.timestamp,
      });
    } else if (e.type === "VoteRetracted") {
      active.delete(key);
    }
  }

  return [...active.values()];
}

/**
 * Check whether a participant has an active (non-retracted) vote on an issue.
 */
export async function hasActiveVote(
  eventStore: EventStore,
  participantId: ParticipantId,
  issueId: IssueId,
): Promise<boolean> {
  const votes = await getActiveVotes(eventStore, { participantId, issueId });
  return votes.length > 0;
}

/**
 * Get the active vote choice for a participant on an issue, or null if none.
 */
export async function getActiveVoteChoice(
  eventStore: EventStore,
  participantId: ParticipantId,
  issueId: IssueId,
): Promise<VoteChoice | null> {
  const votes = await getActiveVotes(eventStore, { participantId, issueId });
  return votes.length > 0 ? votes[0]!.choice : null;
}

/**
 * Compute vote counts per choice for an issue (excluding retracted votes).
 */
export async function getActiveVoteCounts(
  eventStore: EventStore,
  issueId: IssueId,
): Promise<Map<string, number>> {
  const votes = await getActiveVotes(eventStore, { issueId });
  const counts = new Map<string, number>();
  for (const v of votes) {
    const choiceKey = typeof v.choice === "string" ? v.choice : (v.choice as string[]).join(",");
    counts.set(choiceKey, (counts.get(choiceKey) ?? 0) + 1);
  }
  return counts;
}

/**
 * Get the set of participant IDs who have an active direct vote on an issue.
 * This is the "direct voters" set used by delegation graph resolution and
 * weight computation.
 *
 * @param before - Optional timestamp for point-in-time snapshots.
 */
export async function getDirectVoters(
  eventStore: EventStore,
  issueId: IssueId,
  before?: Timestamp,
): Promise<Set<ParticipantId>> {
  const votes = await getActiveVotes(eventStore, { issueId, before });
  return new Set(votes.map((v) => v.participantId));
}
