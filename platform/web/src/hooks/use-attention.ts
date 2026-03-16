import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import * as api from "../api/client.js";
import type { Assembly, VotingEvent } from "../api/types.js";

export interface PendingVote {
  assemblyId: string;
  assemblyName: string;
  eventId: string;
  eventTitle: string;
  issueId: string;
  issueTitle: string;
  votingEnd: string;
  hasVoted: boolean;
  isDelegated: boolean;
  delegateTargetName: string | null;
}

export interface AttentionState {
  pendingVotes: PendingVote[];
  totalPending: number;
  pendingByAssembly: Record<string, number>;
  assemblySummaries: Array<{
    assembly: Assembly;
    activeEventCount: number;
    pendingVoteCount: number;
  }>;
  nearestDeadline: PendingVote | null;
  loading: boolean;
  lastUpdated: number;
  refresh: () => void;
}

const defaultState: AttentionState = {
  pendingVotes: [],
  totalPending: 0,
  pendingByAssembly: {},
  assemblySummaries: [],
  nearestDeadline: null,
  loading: true,
  lastUpdated: 0,
  refresh: () => {},
};

export const AttentionContext = createContext<AttentionState>(defaultState);

export function useAttention() {
  return useContext(AttentionContext);
}

const POLL_INTERVAL_ACTIVE = 60_000;
const POLL_INTERVAL_BACKGROUND = 300_000;

export function useAttentionProvider(userId: string | null): AttentionState {
  const [state, setState] = useState<AttentionState>(defaultState);
  const versionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setState({ ...defaultState, loading: false });
      return;
    }

    const version = ++versionRef.current;

    try {
      const [membershipRes, allAssemblies] = await Promise.all([
        api.getUserAssemblies(userId),
        api.listAssemblies(),
      ]);
      if (versionRef.current !== version) return;

      // Build a map of assemblyId → assembly-specific participantId
      const membershipMap = new Map(
        membershipRes.memberships.map((m) => [m.assemblyId, m.participantId]),
      );
      // Only process assemblies where the user is a member
      const assemblies = allAssemblies.filter((a) => membershipMap.has(a.id));

      const summaries: AttentionState["assemblySummaries"] = [];
      const allPending: PendingVote[] = [];

      await Promise.allSettled(
        assemblies.map(async (asm) => {
          const participantId = membershipMap.get(asm.id)!;
          const [eventsRes, historyRes, delegRes] = await Promise.allSettled([
            api.listEvents(asm.id),
            api.getVotingHistory(asm.id, participantId),
            api.listDelegations(asm.id, participantId),
          ]);

          const events: VotingEvent[] = eventsRes.status === "fulfilled" ? eventsRes.value.events : [];
          const votedIssueIds = new Set(
            historyRes.status === "fulfilled" ? historyRes.value.history.map((h) => h.issueId) : [],
          );
          const myDelegations = delegRes.status === "fulfilled" ? delegRes.value.delegations : [];

          // For each event, fetch full event to get status
          const eventDetails = await Promise.allSettled(
            events.map((evt) => api.getEvent(asm.id, evt.id)),
          );

          let activeCount = 0;
          let pendingCount = 0;

          for (const result of eventDetails) {
            if (result.status !== "fulfilled") continue;
            const evt = result.value;
            if (evt.status !== "voting") {
              if (evt.status === "deliberation") activeCount++;
              continue;
            }
            activeCount++;

            const issues = evt.issues ?? [];
            // Fetch participants to resolve delegate names
            const participantsRes = await api.listParticipants(asm.id).catch(() => ({ participants: [] }));
            const nameMap = new Map(participantsRes.participants.map((p) => [p.id, p.name]));

            for (const issue of issues) {
              const hasVoted = votedIssueIds.has(issue.id);
              // Check if there's a delegation that covers this issue's topics
              const relevantDelegation = myDelegations.find((d) => {
                if (!d.active) return false;
                if (d.topicScope.length === 0) return true; // global delegation
                const issueTopics = issue.topicIds ?? [];
                return d.topicScope.some((t) => issueTopics.includes(t));
              });
              const isDelegated = Boolean(relevantDelegation) && !hasVoted;
              const delegateName = relevantDelegation ? (nameMap.get(relevantDelegation.targetId) ?? null) : null;

              const pending: PendingVote = {
                assemblyId: asm.id,
                assemblyName: asm.name,
                eventId: evt.id,
                eventTitle: evt.title,
                issueId: issue.id,
                issueTitle: issue.title,
                votingEnd: evt.timeline.votingEnd,
                hasVoted,
                isDelegated,
                delegateTargetName: delegateName,
              };

              if (!hasVoted && !isDelegated) pendingCount++;
              allPending.push(pending);
            }
          }

          summaries.push({
            assembly: asm,
            activeEventCount: activeCount,
            pendingVoteCount: pendingCount,
          });
        }),
      );

      if (versionRef.current !== version) return;

      // Sort by deadline
      allPending.sort((a, b) => new Date(a.votingEnd).getTime() - new Date(b.votingEnd).getTime());

      const pendingOnly = allPending.filter((v) => !v.hasVoted && !v.isDelegated);
      const pendingByAssembly: Record<string, number> = {};
      for (const v of pendingOnly) {
        pendingByAssembly[v.assemblyId] = (pendingByAssembly[v.assemblyId] ?? 0) + 1;
      }

      setState({
        pendingVotes: allPending,
        totalPending: pendingOnly.length,
        pendingByAssembly,
        assemblySummaries: summaries,
        nearestDeadline: pendingOnly[0] ?? null,
        loading: false,
        lastUpdated: Date.now(),
        refresh: fetchData,
      });
    } catch {
      if (versionRef.current !== version) return;
      setState((prev) => ({ ...prev, loading: false, refresh: fetchData }));
    }
  }, [userId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();

    const poll = () => {
      const interval = document.visibilityState === "visible"
        ? POLL_INTERVAL_ACTIVE
        : POLL_INTERVAL_BACKGROUND;
      timerRef.current = setTimeout(() => {
        fetchData();
        poll();
      }, interval);
    };
    poll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchData]);

  return { ...state, refresh: fetchData };
}
