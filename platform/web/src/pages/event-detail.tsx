import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useIssueStatus, invalidateHistoryCache } from "../hooks/use-issue-status.js";
import * as api from "../api/client.js";
import type { Tally, WeightDist } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Spinner, ErrorBox, Badge } from "../components/ui.js";

export function EventDetail() {
  const { assemblyId, eventId } = useParams();
  const { participantId } = useIdentity();
  const { data: event, loading, error, refetch } = useApi(
    () => api.getEvent(assemblyId!, eventId!),
    [assemblyId, eventId],
  );
  const { data: tallyData, refetch: refetchTally } = useApi(
    () => api.getTally(assemblyId!, eventId!),
    [assemblyId, eventId],
  );
  const { data: weightsData } = useApi(
    () => api.getWeights(assemblyId!, eventId!),
    [assemblyId, eventId],
  );
  const { data: participantsData } = useApi(
    () => api.listParticipants(assemblyId!),
    [assemblyId],
  );

  if (loading) return <Spinner />;
  if (error || !event) return <ErrorBox message={error ?? "Event not found"} onRetry={refetch} />;

  const participants = participantsData?.participants ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));

  const refreshAll = () => {
    invalidateHistoryCache();
    refetch();
    refetchTally();
  };

  const issues = event.issues ?? [];
  const status = event.status ?? "upcoming";

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
              tally={tally ?? null}
              weightDist={weightDist ?? null}
              nameMap={nameMap}
              eventStatus={status}
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
    deliberation: { color: "blue", label: "Deliberation" },
    upcoming: { color: "yellow", label: "Upcoming" },
    closed: { color: "gray", label: "Closed" },
  };
  const entry = map[status] ?? { color: "gray" as const, label: status };
  return <Badge color={entry.color}>{entry.label}</Badge>;
}

function EventTimeline({ timeline, status }: {
  timeline: { deliberationStart: string; votingStart: string; votingEnd: string };
  status: string;
}) {
  const phases = [
    { key: "deliberation", label: "Deliberation", date: timeline.deliberationStart },
    { key: "voting", label: "Voting", date: timeline.votingStart },
    { key: "closed", label: "Closed", date: timeline.votingEnd },
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
            <span className={`text-xs mt-1.5 ${idx === activeIdx ? "text-brand font-medium" : "text-gray-400"}`}>
              {phase.label}
            </span>
            <span className="text-[10px] text-gray-300">
              {new Date(phase.date).toLocaleDateString()}
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
        <span className="text-sm text-green-700 font-medium">You've voted on all {issues.length} issues</span>
      </div>
    );
  }

  return (
    <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
      <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span className="text-sm text-amber-700 font-medium">
        {pendingCount} of {issues.length} issue{issues.length !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} your vote
      </span>
    </div>
  );
}

function IssueVotingCard({
  assemblyId,
  issueId,
  title,
  description,
  tally,
  weightDist,
  nameMap,
  eventStatus,
  onVoted,
}: {
  assemblyId: string;
  issueId: string;
  title: string;
  description: string;
  tally: Tally | null;
  weightDist: WeightDist | null;
  nameMap: Map<string, string>;
  eventStatus: string;
  onVoted: () => void;
}) {
  const { participantId } = useIdentity();
  const issueStatus = useIssueStatus(assemblyId, participantId, issueId);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [showVoteButtons, setShowVoteButtons] = useState(false);
  const [showWeights, setShowWeights] = useState(false);

  const votingOpen = eventStatus === "voting";

  const handleVote = async (choice: string) => {
    if (!participantId) return;
    setVoting(true);
    setVoteError(null);
    try {
      await api.castVote(assemblyId, { participantId, issueId, choice });
      setShowVoteButtons(false);
      onVoted();
    } catch (err: unknown) {
      setVoteError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setVoting(false);
    }
  };

  const totalVotes = tally?.totalVotes ?? 0;

  // Build delegation chain display
  const chainNames = useMemo(() => {
    if (issueStatus.delegateChain.length <= 1) return [];
    return issueStatus.delegateChain
      .slice(1)
      .map((id) => nameMap.get(id) ?? id.slice(0, 8));
  }, [issueStatus.delegateChain, nameMap]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-medium text-gray-900">{title}</h2>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          {tally?.winner && <Badge color="green">Winner: {tally.winner}</Badge>}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {/* User voting status section */}
        {participantId && !issueStatus.loading && (
          <UserVoteStatus
            issueStatus={issueStatus}
            chainNames={chainNames}
            terminalVoterName={issueStatus.terminalVoterId ? (nameMap.get(issueStatus.terminalVoterId) ?? null) : null}
            votingOpen={votingOpen}
            eventStatus={eventStatus}
            showVoteButtons={showVoteButtons}
            onToggleVoteButtons={() => setShowVoteButtons(!showVoteButtons)}
          />
        )}

        {/* Vote buttons */}
        {votingOpen && participantId && (
          (!issueStatus.hasVoted && !issueStatus.isDelegated && !issueStatus.loading) || showVoteButtons
        ) && (
          <div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <span className="text-sm text-gray-500">Cast vote:</span>
              <div className="flex gap-2">
                <Button size="lg" onClick={() => handleVote("for")} disabled={voting} className="flex-1 sm:flex-none">
                  For
                </Button>
                <Button size="lg" variant="secondary" onClick={() => handleVote("against")} disabled={voting} className="flex-1 sm:flex-none">
                  Against
                </Button>
                <Button size="lg" variant="ghost" onClick={() => handleVote("abstain")} disabled={voting} className="flex-1 sm:flex-none">
                  Abstain
                </Button>
              </div>
            </div>
            {voteError && <p className="text-sm text-red-600 mt-1">{voteError}</p>}
          </div>
        )}

        {!participantId && votingOpen && (
          <p className="text-sm text-gray-400">Select an identity to vote.</p>
        )}

        {/* Tally visualization */}
        {tally && totalVotes > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Results</h3>
            <div className="space-y-3">
              {Object.entries(tally.counts)
                .sort(([, a], [, b]) => b - a)
                .map(([choice, count]) => {
                  const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
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
                          className={`h-4 sm:h-3 rounded-full transition-all ${choice === "for" ? "bg-brand" : choice === "against" ? "bg-red-400" : "bg-gray-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-4 mt-3 text-xs text-gray-400 gap-0.5">
              <span>Total: {tally.totalVotes} weighted votes</span>
              <span>Participating: {tally.participatingCount}/{tally.eligibleCount}</span>
              <span>
                Quorum: {tally.quorumMet ? "Met" : "Not met"} ({(tally.quorumThreshold * 100).toFixed(0)}%)
              </span>
            </div>
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
              Weight Distribution
            </button>
            {showWeights && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                {Object.entries(weightDist.weights)
                  .sort(([, a], [, b]) => b - a)
                  .map(([pid, weight]) => (
                    <div key={pid} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2.5 min-h-[44px] sm:min-h-0 sm:py-2">
                      <span className="text-gray-700">{nameMap.get(pid) ?? pid.slice(0, 8)}</span>
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
            )}
          </div>
        )}

        {tally && totalVotes === 0 && (
          <p className="text-sm text-gray-400">No votes cast yet.</p>
        )}
      </CardBody>
    </Card>
  );
}

function UserVoteStatus({
  issueStatus,
  chainNames,
  terminalVoterName,
  votingOpen,
  eventStatus,
  showVoteButtons,
  onToggleVoteButtons,
}: {
  issueStatus: ReturnType<typeof useIssueStatus>;
  chainNames: string[];
  terminalVoterName: string | null;
  votingOpen: boolean;
  eventStatus: string;
  showVoteButtons: boolean;
  onToggleVoteButtons: () => void;
}) {
  // Already voted
  if (issueStatus.hasVoted) {
    return (
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-green-700">
            You voted <span className="font-semibold capitalize">{issueStatus.myVoteChoice}</span>
            {issueStatus.myVoteDate && (
              <span className="text-green-500 ml-1">
                on {new Date(issueStatus.myVoteDate).toLocaleDateString()}
              </span>
            )}
          </span>
        </div>
        {votingOpen && (
          <button
            onClick={onToggleVoteButtons}
            className="text-xs text-green-600 hover:text-green-800 underline min-h-[32px] flex items-center"
          >
            {showVoteButtons ? "Cancel" : "Change vote"}
          </button>
        )}
      </div>
    );
  }

  // Delegated
  if (issueStatus.isDelegated) {
    const chainDisplay = chainNames.join(" \u2192 ");
    return (
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <span className="text-sm text-blue-700 truncate">
            Delegated to <span className="font-semibold">{terminalVoterName ?? chainNames[chainNames.length - 1]}</span>
            {chainNames.length > 1 && (
              <span className="text-blue-400 ml-1">via {chainDisplay}</span>
            )}
          </span>
        </div>
        {votingOpen && (
          <button
            onClick={onToggleVoteButtons}
            className="text-xs text-blue-600 hover:text-blue-800 underline min-h-[32px] flex items-center shrink-0"
          >
            {showVoteButtons ? "Cancel" : "Vote directly"}
          </button>
        )}
      </div>
    );
  }

  // Voting not open
  if (!votingOpen) {
    if (eventStatus === "deliberation") {
      return (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-sm text-gray-500">Voting has not started yet — review the issue during deliberation</span>
        </div>
      );
    }
    if (eventStatus === "closed") {
      return (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-sm text-gray-500">Voting has closed</span>
        </div>
      );
    }
    return null;
  }

  // Needs vote (default state during voting)
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
      <div className="w-2 h-2 rounded-full bg-amber-500" />
      <span className="text-sm text-amber-700 font-medium">You haven't voted on this issue</span>
    </div>
  );
}
