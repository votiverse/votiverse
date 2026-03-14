import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useParticipant } from "../hooks/use-participant.js";
import * as api from "../api/client.js";
import type { Tally, WeightDist } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Spinner, ErrorBox, StatusBadge, Badge } from "../components/ui.js";

export function EventDetail() {
  const { assemblyId, eventId } = useParams();
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
    refetch();
    refetchTally();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">{event.title}</h1>
          <StatusBadge status={event.status ?? "upcoming"} />
        </div>
        {event.description && <p className="text-sm text-gray-500">{event.description}</p>}
        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span>Deliberation: {new Date(event.timeline.deliberationStart).toLocaleString()}</span>
          <span>Voting: {new Date(event.timeline.votingStart).toLocaleString()} - {new Date(event.timeline.votingEnd).toLocaleString()}</span>
        </div>
      </div>

      <div className="space-y-6">
        {(event.issues ?? []).map((issue, idx) => {
          const tally = tallyData?.tallies?.[idx];
          const weightDist = weightsData?.weights?.[idx];
          return (
            <IssueCard
              key={issue.id}
              assemblyId={assemblyId!}
              issueId={issue.id}
              title={issue.title}
              description={issue.description}
              tally={tally ?? null}
              weightDist={weightDist ?? null}
              nameMap={nameMap}
              votingOpen={event.status === "voting"}
              onVoted={refreshAll}
            />
          );
        })}
      </div>
    </div>
  );
}

function IssueCard({
  assemblyId,
  issueId,
  title,
  description,
  tally,
  weightDist,
  nameMap,
  votingOpen,
  onVoted,
}: {
  assemblyId: string;
  issueId: string;
  title: string;
  description: string;
  tally: Tally | null;
  weightDist: WeightDist | null;
  nameMap: Map<string, string>;
  votingOpen: boolean;
  onVoted: () => void;
}) {
  const { participantId } = useParticipant();
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

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

  const totalVotes = tally?.totalVotes ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-gray-900">{title}</h2>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          {tally?.winner && <Badge color="green">Winner: {tally.winner}</Badge>}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {/* Vote buttons */}
        {votingOpen && (
          <div>
            {!participantId ? (
              <p className="text-sm text-gray-400">Select a participant in the header to vote.</p>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 mr-2">Cast vote:</span>
                <Button size="sm" onClick={() => handleVote("for")} disabled={voting}>
                  For
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleVote("against")} disabled={voting}>
                  Against
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleVote("abstain")} disabled={voting}>
                  Abstain
                </Button>
              </div>
            )}
            {voteError && <p className="text-sm text-red-600 mt-1">{voteError}</p>}
          </div>
        )}

        {/* Tally visualization */}
        {tally && totalVotes > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Tally (weighted)</h3>
            <div className="space-y-2">
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
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${choice === "for" ? "bg-brand" : choice === "against" ? "bg-red-400" : "bg-gray-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-400">
              <span>Total: {tally.totalVotes} weighted votes</span>
              <span>Participating: {tally.participatingCount}/{tally.eligibleCount}</span>
              <span>Quorum: {tally.quorumMet ? "Met" : "Not met"} ({(tally.quorumThreshold * 100).toFixed(0)}%)</span>
            </div>
          </div>
        )}

        {/* Weight breakdown */}
        {weightDist && Object.keys(weightDist.weights).length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Weight Distribution</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(weightDist.weights)
                .sort(([, a], [, b]) => b - a)
                .map(([pid, weight]) => (
                  <div key={pid} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2">
                    <span className="text-gray-700">{nameMap.get(pid) ?? pid.slice(0, 8)}</span>
                    <span className="font-semibold text-gray-900">
                      {weight === 1 ? "1" : weight.toFixed(0)}
                      {weight > 1 && (
                        <span className="text-xs text-gray-400 ml-1">
                          (1+{(weight - 1).toFixed(0)} delegated)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tally && totalVotes === 0 && (
          <p className="text-sm text-gray-400">No votes cast yet.</p>
        )}
      </CardBody>
    </Card>
  );
}
