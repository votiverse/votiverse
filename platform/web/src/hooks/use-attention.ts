import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import * as api from "../api/client.js";
import type { Assembly, VotingEvent } from "../api/types.js";
import { deriveEventStatus, deriveSurveyStatus } from "../lib/status.js";

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

export interface PendingSurvey {
  assemblyId: string;
  assemblyName: string;
  surveyId: string;
  surveyTitle: string;
  questionCount: number;
  closesAt: number;
}

export interface AttentionState {
  pendingVotes: PendingVote[];
  pendingSurveys: PendingSurvey[];
  totalPending: number;
  totalPendingSurveys: number;
  pendingByAssembly: Record<string, number>;
  assemblySummaries: Array<{
    assembly: Assembly;
    activeEventCount: number;
    pendingVoteCount: number;
    pendingSurveyCount: number;
  }>;
  nearestDeadline: PendingVote | null;
  loading: boolean;
  lastUpdated: number;
  refresh: () => void;
}

const defaultState: AttentionState = {
  pendingVotes: [],
  pendingSurveys: [],
  totalPending: 0,
  totalPendingSurveys: 0,
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

export interface MembershipEntry {
  assemblyId: string;
  participantId: string;
}

export function useAttentionProvider(memberships: MembershipEntry[] | null): AttentionState {
  const [state, setState] = useState<AttentionState>(defaultState);
  const versionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    // null = identity still loading, keep spinner. [] = loaded but no memberships.
    if (memberships === null) return;
    if (memberships.length === 0) {
      setState({ ...defaultState, loading: false });
      return;
    }

    const version = ++versionRef.current;

    try {
      // Build membership map from the local identity data (no API call needed)
      const membershipMap = new Map(
        memberships.map((m) => [m.assemblyId, m.participantId]),
      );

      const allAssemblies = await api.listAssemblies();
      if (versionRef.current !== version) return;

      // Only process assemblies where the user is a member
      const assemblies = allAssemblies.filter((a) => membershipMap.has(a.id));

      const summaries: AttentionState["assemblySummaries"] = [];
      const allPending: PendingVote[] = [];
      const allPendingSurveys: PendingSurvey[] = [];

      await Promise.allSettled(
        assemblies.map(async (asm) => {
          const participantId = membershipMap.get(asm.id)!;
          const [eventsRes, historyRes, surveysRes] = await Promise.allSettled([
            api.listEvents(asm.id),
            api.getVotingHistory(asm.id, participantId),
            api.listSurveys(asm.id, participantId),
          ]);

          const events: VotingEvent[] = eventsRes.status === "fulfilled" ? eventsRes.value.events : [];
          const votedIssueIds = new Set(
            historyRes.status === "fulfilled" ? historyRes.value.history.map((h) => h.issueId) : [],
          );

          // Fetch participants once per assembly (used to resolve delegate names)
          const participantsRes = await api.listParticipants(asm.id).catch(() => ({ participants: [] }));
          const nameMap = new Map(participantsRes.participants.map((p) => [p.id, p.name]));

          // For each event, fetch full event to get status
          const eventDetails = await Promise.allSettled(
            events.map((evt) => api.getEvent(asm.id, evt.id)),
          );

          let activeCount = 0;
          let pendingCount = 0;

          for (const result of eventDetails) {
            if (result.status !== "fulfilled") continue;
            const evt = result.value;
            const evtStatus = evt.timeline ? deriveEventStatus(evt.timeline) : "upcoming";
            if (evtStatus !== "voting") {
              if (evtStatus === "deliberation") activeCount++;
              continue;
            }
            activeCount++;

            const issues = evt.issues ?? [];

            // Resolve delegation chains for all issues in parallel (engine-backed)
            const chainResults = await Promise.allSettled(
              issues.map((issue) => api.resolveChain(asm.id, participantId, issue.id)),
            );

            for (let i = 0; i < issues.length; i++) {
              const issue = issues[i]!;
              const hasVoted = votedIssueIds.has(issue.id);

              const chainRes = chainResults[i]!;
              const chain = chainRes.status === "fulfilled" ? chainRes.value : null;
              const isDelegated = chain != null && chain.chain.length > 1 && !chain.votedDirectly;

              // The direct delegate is chain[1] (chain[0] is the participant themselves)
              const delegateTargetId = isDelegated && chain!.chain.length > 1 ? chain!.chain[1] : null;
              const delegateName = delegateTargetId ? (nameMap.get(delegateTargetId) ?? null) : null;

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

          // Pending surveys: open surveys the user hasn't responded to
          let pendingSurveyCount = 0;
          if (surveysRes.status === "fulfilled") {
            const surveys = surveysRes.value.surveys ?? [];
            for (const survey of surveys) {
              if (deriveSurveyStatus(survey.schedule, survey.closesAt) === "open" && survey.hasResponded === false) {
                pendingSurveyCount++;
                allPendingSurveys.push({
                  assemblyId: asm.id,
                  assemblyName: asm.name,
                  surveyId: survey.id,
                  surveyTitle: survey.title,
                  questionCount: survey.questions?.length ?? 0,
                  closesAt: survey.closesAt,
                });
              }
            }
          }

          summaries.push({
            assembly: asm,
            activeEventCount: activeCount,
            pendingVoteCount: pendingCount,
            pendingSurveyCount,
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

      // Sort surveys by closest deadline first
      allPendingSurveys.sort((a, b) => a.closesAt - b.closesAt);

      setState({
        pendingVotes: allPending,
        pendingSurveys: allPendingSurveys,
        totalPending: pendingOnly.length,
        totalPendingSurveys: allPendingSurveys.length,
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
  }, [memberships]);

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
