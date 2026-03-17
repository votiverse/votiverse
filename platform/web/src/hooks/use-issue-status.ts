import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "../api/client.js";
import type { DelegationChain, VotingHistory } from "../api/types.js";

export interface IssueStatus {
  hasVoted: boolean;
  myVoteChoice: string | null;
  myVoteDate: string | null;
  isDelegated: boolean;
  delegateChain: string[];
  terminalVoterId: string | null;
  loading: boolean;
  refetch: () => void;
}

const EMPTY_STATUS: Omit<IssueStatus, "refetch"> = {
  hasVoted: false,
  myVoteChoice: null,
  myVoteDate: null,
  isDelegated: false,
  delegateChain: [],
  terminalVoterId: null,
  loading: true,
};

/**
 * Cache voting history per (assemblyId, participantId) so that multiple
 * IssueVotingCards on the same EventDetail page share a single fetch.
 */
const historyCache = new Map<string, Promise<VotingHistory>>();

function getCachedHistory(assemblyId: string, participantId: string): Promise<VotingHistory> {
  const key = `${assemblyId}:${participantId}`;
  const cached = historyCache.get(key);
  if (cached) return cached;
  const promise = api.getVotingHistory(assemblyId, participantId);
  historyCache.set(key, promise);
  // Expire after 30 seconds to allow refetch after voting
  setTimeout(() => historyCache.delete(key), 30_000);
  return promise;
}

/** Clear the cache (call after casting a vote) */
export function invalidateHistoryCache() {
  historyCache.clear();
}

export function useIssueStatus(
  assemblyId: string | undefined,
  participantId: string | null,
  issueId: string,
): IssueStatus {
  const [status, setStatus] = useState<Omit<IssueStatus, "refetch">>(EMPTY_STATUS);
  const versionRef = useRef(0);
  const [fetchVersion, setFetchVersion] = useState(0);

  const refetch = useCallback(() => {
    invalidateHistoryCache();
    setFetchVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!assemblyId || !participantId) {
      setStatus({ ...EMPTY_STATUS, loading: false });
      return;
    }

    const version = ++versionRef.current;

    (async () => {
      try {
        const [chain, history] = await Promise.allSettled([
          api.resolveChain(assemblyId, participantId, issueId),
          getCachedHistory(assemblyId, participantId),
        ]);

        if (versionRef.current !== version) return;

        const chainResult: DelegationChain | null =
          chain.status === "fulfilled" ? chain.value : null;
        const historyResult: VotingHistory | null =
          history.status === "fulfilled" ? history.value : null;

        const vote = historyResult?.history.find((h) => h.issueId === issueId);

        // Delegation: chain has more than one entry and the participant did NOT vote directly
        const isDelegated =
          chainResult != null &&
          chainResult.chain.length > 1 &&
          !chainResult.votedDirectly;

        setStatus({
          hasVoted: Boolean(vote),
          myVoteChoice: vote?.choice ?? null,
          myVoteDate: vote?.votedAt ?? null,
          isDelegated,
          delegateChain: chainResult?.chain ?? [],
          terminalVoterId: chainResult?.terminalVoter ?? null,
          loading: false,
        });
      } catch {
        if (versionRef.current !== version) return;
        setStatus({ ...EMPTY_STATUS, loading: false });
      }
    })();
  }, [assemblyId, participantId, issueId, fetchVersion]);

  return { ...status, refetch };
}
