import { useState, useMemo } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import { useIssueStatus, invalidateHistoryCache } from "../hooks/use-issue-status.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import type { Tally, WeightDist, ParticipationRecord } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Spinner, ErrorBox, Badge, Tooltip } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { QuickDelegateForm } from "../components/quick-delegate-form.js";

/** Neutral color rotation for tally bars — first place gets the strongest color, no choice is privileged. */
const TALLY_COLORS = [
  "bg-blue-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
];

interface DelegationConfig {
  enabled: boolean;
  topicScoped: boolean;
}

export function EventDetail() {
  const { assemblyId, eventId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { assembly } = useAssembly(assemblyId);
  const { data: event, loading, error, refetch } = useApi(
    () => api.getEvent(assemblyId!, eventId!),
    [assemblyId, eventId],
  );
  const { data: tallyData, refetch: refetchTally } = useApi(
    () => api.getTally(assemblyId!, eventId!),
    [assemblyId, eventId],
  );
  const { data: weightsData } = useApi(
    () => api.getWeights(assemblyId!, eventId!).catch((err) => {
      // 403 is expected for secret ballots or sealed results — suppress
      if (err instanceof api.ApiError && err.status === 403) return { eventId: eventId!, weights: [] };
      throw err;
    }),
    [assemblyId, eventId],
  );
  const { data: participantsData } = useApi(
    () => api.listParticipants(assemblyId!),
    [assemblyId],
  );
  const { data: topicsData } = useApi(
    () => api.listTopics(assemblyId!),
    [assemblyId],
  );

  const status = event?.status ?? "upcoming";

  // Fetch participation records for closed events (O(1) lookup for what happened with your vote)
  const { data: participationData } = useApi(
    () =>
      status === "closed" && participantId
        ? api.getParticipation(assemblyId!, eventId!, participantId)
        : Promise.resolve(null),
    [assemblyId, eventId, participantId, status],
  );

  // Build a map from issueId → ParticipationRecord (must be before early returns — rules of hooks)
  const participationByIssue = useMemo(() => {
    const map = new Map<string, ParticipationRecord>();
    if (participationData?.participation) {
      for (const rec of participationData.participation) {
        map.set(rec.issueId, rec);
      }
    }
    return map;
  }, [participationData]);

  // Extract config from assembly (must be before early returns — rules of hooks)
  const delegationConfig: DelegationConfig = useMemo(() => ({
    enabled: assembly?.config.delegation.enabled ?? false,
    topicScoped: assembly?.config.delegation.topicScoped ?? false,
  }), [assembly]);

  const resultsVisibility = assembly?.config.ballot.resultsVisibility ?? "sealed";
  const attention = useAttention();

  if (loading) return <Spinner />;
  if (error || !event) return <ErrorBox message={error ?? "Vote not found"} onRetry={refetch} />;

  const participants = participantsData?.participants ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const topicNameMap = new Map((topicsData?.topics ?? []).map((t) => [t.id, t.name]));

  const refreshAll = () => {
    invalidateHistoryCache();
    attention.refresh();
    refetch();
    refetchTally();
  };

  const issues = event.issues ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Event header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{event.title}</h1>
          <EventStatusBadge status={status} />
        </div>
        {event.description && <p className="text-sm text-gray-500">{event.description}</p>}
      </div>

      {/* Timeline bar */}
      <EventTimeline
        timeline={event.timeline}
        status={status}
      />

      {/* Issue summary for current user */}
      {participantId && issues.length > 0 && (
        <IssueSummary
          assemblyId={assemblyId!}
          participantId={participantId}
          issues={issues}
        />
      )}

      {/* Issue cards */}
      <div className="space-y-4 sm:space-y-6">
        {issues.map((issue, idx) => {
          const tally = tallyData?.tallies?.[idx];
          const weightDist = weightsData?.weights?.[idx];
          return (
            <IssueVotingCard
              key={issue.id}
              assemblyId={assemblyId!}
              issueId={issue.id}
              title={issue.title}
              description={issue.description}
              choices={issue.choices}
              topicIds={issue.topicIds}
              topicNameMap={topicNameMap}
              tally={tally ?? null}
              weightDist={weightDist ?? null}
              nameMap={nameMap}
              eventStatus={status}
              participation={participationByIssue.get(issue.id) ?? null}
              delegationConfig={delegationConfig}
              resultsVisibility={resultsVisibility}
              participants={participants}
              topics={topicsData?.topics ?? []}
              onVoted={refreshAll}
            />
          );
        })}
      </div>
    </div>
  );
}

function EventStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: "green" | "blue" | "yellow" | "gray"; label: string }> = {
    voting: { color: "green", label: "Voting Open" },
    deliberation: { color: "blue", label: "Discussion" },
    upcoming: { color: "yellow", label: "Upcoming" },
    closed: { color: "gray", label: "Ended" },
  };
  const entry = map[status] ?? { color: "gray" as const, label: status };
  return <Badge color={entry.color}>{entry.label}</Badge>;
}

/** Format a date, including time when it's not midnight. */
function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  // Show time when hours/minutes are set (not midnight)
  if (d.getHours() !== 0 || d.getMinutes() !== 0) {
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${date}, ${time}`;
  }
  return date;
}

function EventTimeline({ timeline, status }: {
  timeline: { deliberationStart: string; votingStart: string; votingEnd: string };
  status: string;
}) {
  const phases = [
    { key: "deliberation", label: "Discussion", date: timeline.deliberationStart },
    { key: "voting", label: "Voting", date: timeline.votingStart },
    { key: "closed", label: "Ended", date: timeline.votingEnd },
  ];

  const activeIdx = status === "deliberation" ? 0 : status === "voting" ? 1 : status === "closed" ? 2 : -1;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-0">
        {phases.map((phase, idx) => (
          <div key={phase.key} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div className={`flex-1 h-0.5 ${idx <= activeIdx ? "bg-brand" : "bg-gray-200"}`} />
              )}
              <div className={`w-3 h-3 rounded-full shrink-0 ${
                idx < activeIdx ? "bg-brand" :
                idx === activeIdx ? "bg-brand ring-4 ring-brand/20" :
                "bg-gray-200"
              }`} />
              {idx < phases.length - 1 && (
                <div className={`flex-1 h-0.5 ${idx < activeIdx ? "bg-brand" : "bg-gray-200"}`} />
              )}
            </div>
            <span className={`text-xs mt-1.5 ${idx === activeIdx ? "text-brand font-medium" : "text-gray-600"}`}>
              {phase.label}
            </span>
            <span className="text-[10px] text-gray-500">
              {formatDateTime(phase.date)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueSummary({ assemblyId, participantId, issues }: {
  assemblyId: string;
  participantId: string;
  issues: Array<{ id: string }>;
}) {
  const { data: history } = useApi(
    () => api.getVotingHistory(assemblyId, participantId),
    [assemblyId, participantId],
  );

  if (!history) return null;

  const votedIssueIds = new Set(history.history.map((h) => h.issueId));
  const votedCount = issues.filter((i) => votedIssueIds.has(i.id)).length;
  const pendingCount = issues.length - votedCount;

  if (pendingCount === 0) {
    return (
      <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
        <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm text-green-700 font-medium">You've voted on all {issues.length} questions</span>
      </div>
    );
  }

  return (
    <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
      <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span className="text-sm text-amber-700 font-medium">
        {pendingCount} of {issues.length} question{issues.length !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} your vote
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IssueVotingCard — one card per issue
// ---------------------------------------------------------------------------

function IssueVotingCard({
  assemblyId,
  issueId,
  title,
  description,
  choices,
  topicIds,
  topicNameMap,
  tally,
  weightDist,
  nameMap,
  eventStatus,
  participation,
  delegationConfig,
  resultsVisibility,
  participants,
  topics,
  onVoted,
}: {
  assemblyId: string;
  issueId: string;
  title: string;
  description: string;
  choices?: string[];
  topicIds?: string[];
  topicNameMap: Map<string, string>;
  tally: Tally | null;
  weightDist: WeightDist | null;
  nameMap: Map<string, string>;
  eventStatus: string;
  participation: ParticipationRecord | null;
  delegationConfig: DelegationConfig;
  resultsVisibility: string;
  participants: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>;
  onVoted: () => void;
}) {
  const { getParticipantId } = useIdentity();
  const participantId = getParticipantId(assemblyId);
  const issueStatus = useIssueStatus(assemblyId, participantId, issueId);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const votingOpen = eventStatus === "voting";

  const handleVote = async (choice: string) => {
    if (!participantId) return;
    setVoting(true);
    setVoteError(null);
    try {
      await api.castVote(assemblyId, { participantId, issueId, choice });
      onVoted();
    } catch (err: unknown) {
      setVoteError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setVoting(false);
    }
  };

  // Build delegation chain display
  const chainNames = useMemo(() => {
    if (issueStatus.delegateChain.length <= 1) return [];
    return issueStatus.delegateChain
      .slice(1)
      .map((id) => nameMap.get(id) ?? id.slice(0, 8));
  }, [issueStatus.delegateChain, nameMap]);

  // Determine if the "needs your vote" indicator should show
  const needsVote = votingOpen && !!participantId && !issueStatus.hasVoted && !issueStatus.isDelegated && !issueStatus.loading;

  return (
    <Card>
      <CardHeader>
        {/* Title row — indicator stays pinned to the right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-medium text-gray-900 truncate">{title}</h2>
            {choices && choices.length > 0 && (
              <Badge color="blue">{choices.length} candidates</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {needsVote && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                Needs your vote
              </span>
            )}
            {tally?.winner && eventStatus === "closed" && (
              <Badge color="green">
                Result: {tally.winner === "for" ? "Approved" : tally.winner === "against" ? "Not approved" : tally.winner}
              </Badge>
            )}
          </div>
        </div>
        {/* Description and topic tags below the title row */}
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        {topicIds && topicIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {topicIds.map((tid) => (
              <span key={tid} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {topicNameMap.get(tid) ?? tid.slice(0, 8)}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        {/* Closed event: historical participation record */}
        {eventStatus === "closed" && participantId && (
          <ClosedEventParticipation participation={participation} nameMap={nameMap} />
        )}

        {/* Open voting: unified voting section (delegation card + vote buttons) */}
        {votingOpen && participantId && !issueStatus.loading && (
          <VotingSection
            assemblyId={assemblyId}
            issueId={issueId}
            choices={choices}
            issueStatus={issueStatus}
            delegationConfig={delegationConfig}
            chainNames={chainNames}
            terminalVoterName={issueStatus.terminalVoterId ? (nameMap.get(issueStatus.terminalVoterId) ?? null) : null}
            issueTopicIds={topicIds ?? []}
            participants={participants}
            topics={topics}
            participantId={participantId!}
            voting={voting}
            voteError={voteError}
            onVote={handleVote}
            onDelegationCreated={onVoted}
          />
        )}

        {/* Deliberation phase message */}
        {eventStatus === "deliberation" && participantId && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-sm text-gray-500">Voting has not started yet — review during the discussion period</span>
          </div>
        )}

        {/* No identity selected */}
        {!participantId && votingOpen && (
          <p className="text-sm text-gray-400">Select an identity to vote.</p>
        )}

        {/* Results section (sealed, live toggle, or final results) */}
        <ResultsSection
          tally={tally}
          weightDist={weightDist}
          choices={choices}
          nameMap={nameMap}
          eventStatus={eventStatus}
          resultsVisibility={resultsVisibility}
        />
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// VotingSection — delegation card + direct vote buttons
// ---------------------------------------------------------------------------

function VotingSection({
  assemblyId,
  issueId,
  choices,
  issueStatus,
  delegationConfig,
  chainNames,
  terminalVoterName,
  issueTopicIds,
  participants,
  topics,
  participantId,
  voting,
  voteError,
  onVote,
  onDelegationCreated,
}: {
  assemblyId: string;
  issueId: string;
  choices?: string[];
  issueStatus: ReturnType<typeof useIssueStatus>;
  delegationConfig: DelegationConfig;
  chainNames: string[];
  terminalVoterName: string | null;
  issueTopicIds: string[];
  participants: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>;
  participantId: string;
  voting: boolean;
  voteError: string | null;
  onVote: (choice: string) => void;
  onDelegationCreated: () => void;
}) {
  const [expanded, setExpanded] = useState(!issueStatus.hasVoted);

  const isMultiOption = choices && choices.length > 0;

  // Collapsed state: user has already voted, show compact summary
  if (issueStatus.hasVoted && !expanded) {
    return (
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Your vote</span>
        <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-green-700">
              You voted <span className="font-semibold capitalize">{issueStatus.myVoteChoice}</span>
              {issueStatus.myVoteDate && (
                <span className="text-green-500 ml-1">
                  on {new Date(issueStatus.myVoteDate).toLocaleDateString()}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-green-600 hover:text-green-800 underline min-h-[32px] flex items-center"
          >
            Change vote
          </button>
        </div>
      </div>
    );
  }

  // Expanded state: show delegation card + vote buttons
  return (
    <div>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Your vote</span>

      {/* Delegation card */}
      <DelegationCard
        assemblyId={assemblyId}
        delegationConfig={delegationConfig}
        isDelegated={issueStatus.isDelegated}
        hasVoted={issueStatus.hasVoted}
        chainNames={chainNames}
        terminalVoterName={terminalVoterName}
        issueTopicIds={issueTopicIds}
        participants={participants}
        topics={topics}
        participantId={participantId}
        onDelegationCreated={onDelegationCreated}
      />

      {/* Direct vote buttons */}
      <div className="mt-3">
        {issueStatus.isDelegated && !issueStatus.hasVoted ? (
          <span className="text-xs text-gray-500 mb-2 block">Or vote directly:</span>
        ) : issueStatus.hasVoted ? (
          <span className="text-xs text-gray-500 mb-2 block">Change your vote:</span>
        ) : null}

        {isMultiOption ? (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {choices.map((choice) => (
                <Button
                  key={choice}
                  size="lg"
                  variant="secondary"
                  onClick={() => onVote(choice)}
                  disabled={voting}
                  className="w-full justify-center"
                >
                  {choice}
                </Button>
              ))}
            </div>
            <div className="mt-2">
              <button
                onClick={() => onVote("abstain")}
                disabled={voting}
                className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50 min-h-[36px] flex items-center"
              >
                Abstain
                {delegationConfig.enabled && (
                  <span className="text-xs text-gray-400 ml-1 no-underline">— won't count and won't be delegated</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button size="lg" variant="secondary" onClick={() => onVote("for")} disabled={voting} className="flex-1 sm:flex-none">
                For
              </Button>
              <Button size="lg" variant="secondary" onClick={() => onVote("against")} disabled={voting} className="flex-1 sm:flex-none">
                Against
              </Button>
              <Button size="lg" variant="secondary" onClick={() => onVote("abstain")} disabled={voting} className="flex-1 sm:flex-none">
                Abstain
              </Button>
            </div>
            {delegationConfig.enabled && (
              <p className="text-xs text-gray-400 mt-1.5">Abstain means your vote won't count and won't be delegated</p>
            )}
          </div>
        )}

        {voteError && <p className="text-sm text-red-600 mt-2">{voteError}</p>}

        {/* Cancel button when changing an existing vote */}
        {issueStatus.hasVoted && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-gray-500 hover:text-gray-700 underline mt-2 min-h-[32px] flex items-center"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DelegationCard — shown at the top of VotingSection
// ---------------------------------------------------------------------------

function DelegationCard({
  assemblyId,
  delegationConfig,
  isDelegated,
  hasVoted,
  chainNames,
  terminalVoterName,
  issueTopicIds,
  participants,
  topics,
  participantId,
  onDelegationCreated,
}: {
  assemblyId: string;
  delegationConfig: DelegationConfig;
  isDelegated: boolean;
  hasVoted: boolean;
  chainNames: string[];
  terminalVoterName: string | null;
  issueTopicIds: string[];
  participants: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>;
  participantId: string;
  onDelegationCreated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);

  // State 1: Active delegation (and no direct vote override)
  if (isDelegated && !hasVoted) {
    const delegateName = terminalVoterName ?? chainNames[chainNames.length - 1];
    const chainDisplay = chainNames.join(" → ");
    return (
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {delegateName && <Avatar name={delegateName} size="xs" />}
          <span className="text-sm text-blue-700 truncate">
            Delegated to <span className="font-semibold">{delegateName}</span>
            {chainNames.length > 1 && (
              <span className="text-blue-400 ml-1">via {chainDisplay}</span>
            )}
          </span>
        </div>
        <Link
          to={`/assembly/${assemblyId}/delegations`}
          className="text-xs text-blue-600 hover:text-blue-800 underline min-h-[32px] flex items-center shrink-0"
        >
          Manage
        </Link>
      </div>
    );
  }

  // State 2: Delegation enabled but not set up (or user voted directly, overriding delegation)
  if (delegationConfig.enabled) {
    return (
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 border-dashed">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span className="text-sm text-gray-500">No delegate for this topic</span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-brand hover:text-brand-dark font-medium min-h-[32px] flex items-center shrink-0"
          >
            Delegate
          </button>
        </div>
        {showForm && (
          <QuickDelegateForm
            assemblyId={assemblyId}
            participantId={participantId}
            participants={participants}
            preselectedTopicIds={issueTopicIds}
            topics={topics}
            isTopicScoped={delegationConfig.topicScoped}
            onCreated={() => { setShowForm(false); onDelegationCreated(); }}
            onClose={() => setShowForm(false)}
          />
        )}
      </div>
    );
  }

  // State 3: Delegation not available for this assembly
  return (
    <Tooltip text="This group's governance rules don't include delegation">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100 w-full opacity-60">
        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
        <span className="text-xs text-gray-400">Delegation is not available in this group</span>
      </div>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// ResultsSection — sealed, live toggle, or final results
// ---------------------------------------------------------------------------

function ResultsSection({
  tally,
  weightDist,
  choices,
  nameMap,
  eventStatus,
  resultsVisibility,
}: {
  tally: Tally | null;
  weightDist: WeightDist | null;
  choices?: string[];
  nameMap: Map<string, string>;
  eventStatus: string;
  resultsVisibility: string;
}) {
  const [showLiveResults, setShowLiveResults] = useState(false);
  const [showLiveWeights, setShowLiveWeights] = useState(false);
  const [showWeights, setShowWeights] = useState(false);

  const totalVotes = tally?.totalVotes ?? 0;
  const votingOpen = eventStatus === "voting";
  const isSealed = tally?.sealed === true;
  const isLive = resultsVisibility === "live" && votingOpen && !isSealed;

  // Sealed results — show lock icon + participation count
  if (isSealed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <span className="text-sm text-gray-500">
          Results are sealed until voting ends
          {tally && tally.participatingCount > 0 && (
            <span className="ml-1">
              · {tally.participatingCount} of {tally.eligibleCount} members have voted
            </span>
          )}
        </span>
      </div>
    );
  }

  // Live results during open voting — behind a click
  if (isLive) {
    return (
      <div className="space-y-2">
        {/* Toggle buttons */}
        {!showLiveResults && totalVotes > 0 && (
          <button
            onClick={() => setShowLiveResults(true)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            View live results
          </button>
        )}

        {!showLiveWeights && weightDist && Object.keys(weightDist.weights).length > 0 && !showLiveResults && (
          <button
            onClick={() => { setShowLiveWeights(true); setShowLiveResults(true); }}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            View live breakdown
          </button>
        )}

        {/* Live results (revealed) */}
        {showLiveResults && tally && totalVotes > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                <span className="text-sm font-medium text-amber-700">Live Results</span>
                <Badge color="yellow">Voting open</Badge>
              </div>
              <button
                onClick={() => { setShowLiveResults(false); setShowLiveWeights(false); }}
                className="text-xs text-amber-600 hover:text-amber-800 underline"
              >
                Hide
              </button>
            </div>
            <TallyBars tally={tally} choices={choices} totalVotes={totalVotes} />
          </div>
        )}

        {/* Live weights (revealed) */}
        {showLiveResults && weightDist && Object.keys(weightDist.weights).length > 0 && (
          <div className={showLiveWeights ? "" : "mt-1"}>
            {!showLiveWeights ? (
              <button
                onClick={() => setShowLiveWeights(true)}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
              >
                <svg className={`w-4 h-4`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                View live breakdown
              </button>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                    <span className="text-sm font-medium text-amber-700">Live Breakdown</span>
                  </div>
                  <button
                    onClick={() => setShowLiveWeights(false)}
                    className="text-xs text-amber-600 hover:text-amber-800 underline"
                  >
                    Hide
                  </button>
                </div>
                <WeightBreakdown weightDist={weightDist} nameMap={nameMap} />
              </div>
            )}
          </div>
        )}

        {totalVotes === 0 && (
          <p className="text-sm text-gray-400">No votes cast yet.</p>
        )}
      </div>
    );
  }

  // Final results (closed events) or non-live open voting — show automatically
  return (
    <div className="space-y-3">
      {tally && totalVotes > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Results</h3>
          <TallyBars tally={tally} choices={choices} totalVotes={totalVotes} />
        </div>
      )}

      {/* Weight breakdown — collapsible */}
      {weightDist && Object.keys(weightDist.weights).length > 0 && (
        <div>
          <button
            onClick={() => setShowWeights(!showWeights)}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className={`w-4 h-4 transition-transform ${showWeights ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Vote breakdown
          </button>
          {showWeights && <WeightBreakdown weightDist={weightDist} nameMap={nameMap} />}
        </div>
      )}

      {tally && totalVotes === 0 && (
        <p className="text-sm text-gray-400">No votes cast yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TallyBars — vote count bars (reused for live and final)
// ---------------------------------------------------------------------------

function TallyBars({
  tally,
  choices,
  totalVotes,
}: {
  tally: Tally;
  choices?: string[];
  totalVotes: number;
}) {
  return (
    <div>
      <div className="space-y-3">
        {Object.entries(
            choices && choices.length > 0
              ? { ...Object.fromEntries(choices.map((c) => [c, 0])), ...tally.counts }
              : tally.counts,
          )
          .sort(([, a], [, b]) => b - a)
          .map(([choice, count], idx) => {
            const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
            const barColor = TALLY_COLORS[idx % TALLY_COLORS.length];
            return (
              <div key={choice}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-900 capitalize">{choice}</span>
                  <span className="text-gray-500">
                    {count} vote{count !== 1 ? "s" : ""} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4 sm:h-3">
                  <div
                    className={`h-4 sm:h-3 rounded-full transition-all ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
      <div className="flex flex-col sm:flex-row sm:gap-4 mt-3 text-xs text-gray-400 gap-0.5">
        <span>{tally.totalVotes} votes total (including delegated votes)</span>
        <span>{tally.participatingCount} of {tally.eligibleCount} members voted</span>
        <span>
          {tally.quorumMet
            ? "Enough members voted to count ✓"
            : `Not enough members voted yet (need ${(tally.quorumThreshold * 100).toFixed(0)}%)`}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeightBreakdown — per-participant weight grid (reused for live and final)
// ---------------------------------------------------------------------------

function WeightBreakdown({
  weightDist,
  nameMap,
}: {
  weightDist: WeightDist;
  nameMap: Map<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
      {Object.entries(weightDist.weights)
        .sort(([, a], [, b]) => b - a)
        .map(([pid, weight]) => (
          <div key={pid} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2.5 min-h-[44px] sm:min-h-0 sm:py-2">
            <span className="flex items-center gap-2 text-gray-700">
              <Avatar name={nameMap.get(pid) ?? pid} size="xs" />
              {nameMap.get(pid) ?? pid.slice(0, 8)}
            </span>
            <span className="font-semibold text-gray-900">
              {weight === 1 ? "1" : weight.toFixed(0)}
              {weight > 1 && (
                <span className="text-xs text-gray-400 ml-1">
                  (1+{(weight - 1).toFixed(0)})
                </span>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClosedEventParticipation — historical record for closed events (unchanged)
// ---------------------------------------------------------------------------

/** Shows what happened with your vote on a closed event, using materialized participation records. */
function ClosedEventParticipation({
  participation,
  nameMap,
}: {
  participation: ParticipationRecord | null;
  nameMap: Map<string, string>;
}) {
  // No participation data yet (still loading, or no identity)
  if (!participation) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-sm text-gray-500">Voting has closed</span>
      </div>
    );
  }

  // Voted directly — your own direct vote is always visible to you
  if (participation.status === "direct") {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm text-green-700">
          You voted{" "}
          <span className="font-semibold capitalize">{participation.effectiveChoice ?? "—"}</span>
          {" "}directly
        </span>
      </div>
    );
  }

  // Delegated — show chain. effectiveChoice may be null under secret ballot.
  if (participation.status === "delegated") {
    const chainDisplay = participation.chain
      .slice(1) // skip self
      .map((id) => nameMap.get(id) ?? id.slice(0, 8))
      .join(" → ");
    const terminalName = participation.terminalVoterId
      ? (nameMap.get(participation.terminalVoterId) ?? participation.terminalVoterId.slice(0, 8))
      : null;
    const choiceHidden = participation.effectiveChoice === null;

    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
        <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <span className="text-sm text-blue-700">
          {choiceHidden ? (
            <>
              Your vote was cast
              {terminalName && (
                <>
                  {" "}via{" "}
                  <span className="font-semibold">{terminalName}</span>
                </>
              )}
              {chainDisplay && (
                <span className="text-blue-400 ml-1">({chainDisplay})</span>
              )}
              <span className="text-blue-400 ml-1">(secret ballot)</span>
            </>
          ) : (
            <>
              Your vote counted as{" "}
              <span className="font-semibold capitalize">{participation.effectiveChoice}</span>
              {terminalName && (
                <>
                  {" "}via{" "}
                  <span className="font-semibold">{terminalName}</span>
                </>
              )}
              {chainDisplay && (
                <span className="text-blue-400 ml-1">({chainDisplay})</span>
              )}
            </>
          )}
        </span>
      </div>
    );
  }

  // Absent — did not participate
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
      <span className="text-sm text-gray-500">You did not participate in this vote</span>
    </div>
  );
}
