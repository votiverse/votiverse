import { Link } from "react-router";
import { useIdentity } from "../hooks/use-identity.js";
import { useAttention, type PendingVote } from "../hooks/use-attention.js";
import { IdentityPicker } from "../components/identity-picker.js";
import { Countdown } from "../components/countdown.js";
import { Card, CardBody, Badge, Skeleton } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { presetLabel } from "../lib/presets.js";

interface VoteGroup {
  assemblyId: string;
  assemblyName: string;
  eventId: string;
  eventTitle: string;
  votingEnd: string;
  pendingCount: number;
  questions: PendingVote[];
}

/** Groups flat pending votes by event, preserving sort order. */
function groupByEvent(votes: PendingVote[]): VoteGroup[] {
  const map = new Map<string, VoteGroup>();
  for (const vote of votes) {
    const key = `${vote.assemblyId}:${vote.eventId}`;
    let group = map.get(key);
    if (!group) {
      group = {
        assemblyId: vote.assemblyId,
        assemblyName: vote.assemblyName,
        eventId: vote.eventId,
        eventTitle: vote.eventTitle,
        votingEnd: vote.votingEnd,
        pendingCount: 0,
        questions: [],
      };
      map.set(key, group);
    }
    group.questions.push(vote);
    if (!vote.hasVoted && !vote.isDelegated) group.pendingCount++;
  }
  return Array.from(map.values());
}

export function Dashboard() {
  const { participantId, participantName } = useIdentity();

  if (!participantId) {
    return <IdentityPicker />;
  }

  return <DashboardContent participantName={participantName} />;
}

function DashboardContent({ participantName }: { participantName: string | null }) {
  const {
    pendingVotes,
    totalPending,
    assemblySummaries,
    nearestDeadline,
    loading,
  } = useAttention();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-24 w-full mb-6 rounded-lg" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
          Hi, {participantName}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Here's what needs your attention.</p>
      </div>

      {/* Action banner */}
      {totalPending > 0 ? (
        <div className="mb-6 rounded-xl bg-brand p-4 sm:p-5 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-lg sm:text-xl font-semibold">
                {totalPending} vote{totalPending !== 1 ? "s" : ""} need{totalPending === 1 ? "s" : ""} you
              </p>
              {nearestDeadline && (
                <p className="text-brand-100 text-sm mt-0.5">
                  Nearest deadline: {nearestDeadline.eventTitle} — closes{" "}
                  <Countdown target={nearestDeadline.votingEnd} className="text-white font-medium" />
                </p>
              )}
            </div>
            {nearestDeadline && (
              <Link
                to={`/assembly/${nearestDeadline.assemblyId}/events/${nearestDeadline.eventId}`}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-white text-brand font-medium rounded-md hover:bg-gray-50 transition-colors min-h-[44px] shrink-0"
              >
                Vote Now
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-green-800">You're all caught up!</p>
              <p className="text-sm text-green-600 mt-0.5">No pending votes across your groups.</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending votes — grouped by vote (event) */}
      {pendingVotes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Pending Votes</h2>
          <div className="space-y-3">
            {groupByEvent(pendingVotes).map((group) => (
              <Link
                key={`${group.assemblyId}-${group.eventId}`}
                to={`/assembly/${group.assemblyId}/events/${group.eventId}`}
                className="block"
              >
                <Card className="hover:border-brand-200 hover:shadow transition-all">
                  <CardBody className="py-3">
                    {/* Event header */}
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                            {group.assemblyName}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{group.eventTitle}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {group.pendingCount > 0 ? (
                          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            {group.pendingCount} vote{group.pendingCount !== 1 ? "s" : ""} needed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            All voted
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          <Countdown target={group.votingEnd} className="text-[10px]" />
                        </span>
                      </div>
                    </div>
                    {/* Question list */}
                    <div className="space-y-1 ml-1">
                      {group.questions.map((q) => (
                        <div key={q.issueId} className="flex items-center justify-between gap-2 py-0.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-gray-300 text-xs">•</span>
                            <span className="text-xs text-gray-600 truncate">{q.issueTitle}</span>
                          </div>
                          <VoteStatusChip vote={q} />
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Assembly cards */}
      {assemblySummaries.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Your Groups</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {assemblySummaries.map(({ assembly, activeEventCount, pendingVoteCount }) => (
              <Link key={assembly.id} to={`/assembly/${assembly.id}`} className="block">
                <Card className="hover:border-brand-200 hover:shadow transition-all h-full">
                  <CardBody>
                    <h3 className="font-medium text-gray-900">{assembly.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{presetLabel(assembly.config.name)}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <Badge color={activeEventCount > 0 ? "blue" : "gray"}>
                        {activeEventCount} active vote{activeEventCount !== 1 ? "s" : ""}
                      </Badge>
                      {pendingVoteCount > 0 && (
                        <Badge color="red">
                          {pendingVoteCount} pending vote{pendingVoteCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {assemblySummaries.length === 0 && pendingVotes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No groups found.</p>
          <Link to="/assemblies" className="text-sm text-brand hover:text-brand-light mt-2 inline-block">
            Browse groups
          </Link>
        </div>
      )}
    </div>
  );
}

function VoteStatusChip({ vote }: { vote: { hasVoted: boolean; isDelegated: boolean; delegateTargetName: string | null } }) {
  if (vote.hasVoted) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Voted
      </span>
    );
  }
  if (vote.isDelegated) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded truncate max-w-[160px]">
        {vote.delegateTargetName && <Avatar name={vote.delegateTargetName} size="xs" className="!w-3.5 !h-3.5" />}
        Delegated{vote.delegateTargetName ? ` to ${vote.delegateTargetName}` : ""}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
      Vote needed
    </span>
  );
}
