import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { DelegationChain } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Select, Label, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { TopicPicker } from "../components/topic-picker.js";

export function Delegations() {
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listDelegations(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: eventsData } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);
  const { assembly } = useAssembly(assemblyId);
  const [creating, setCreating] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  const delegations = data?.delegations ?? [];
  const participants = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const topicNameMap = new Map((topicsData?.topics ?? []).map((t) => [t.id, t.name]));
  const isTopicScoped = assembly?.config.delegation.topicScoped ?? false;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Delegates</h1>
        <Button onClick={() => setCreating(true)}>Trust someone with your vote</Button>
      </div>

      {creating && (
        <CreateDelegationForm
          assemblyId={assemblyId!}
          participants={participants}
          isTopicScoped={isTopicScoped}
          onClose={() => setCreating(false)}
          onCreated={refetch}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Active delegations */}
        <Card>
          <CardHeader>
            <h2 className="font-medium text-gray-900">Your Trusted Delegates</h2>
          </CardHeader>
          <CardBody>
            {delegations.length === 0 ? (
              <EmptyState title="No delegates" description="You haven't trusted anyone with your vote yet." />
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {delegations.map((d) => (
                  <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-md px-3 sm:px-4 py-3 gap-2 min-h-[52px]">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0 flex-wrap">
                      <Avatar name={nameMap.get(d.sourceId) ?? d.sourceId} size="xs" />
                      <span className="font-medium text-gray-900 truncate">
                        {nameMap.get(d.sourceId) ?? d.sourceId.slice(0, 8)}
                      </span>
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <Avatar name={nameMap.get(d.targetId) ?? d.targetId} size="xs" />
                      <span className="font-medium text-brand truncate">
                        {nameMap.get(d.targetId) ?? d.targetId.slice(0, 8)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {d.topicScope.length === 0
                          ? "(global)"
                          : `(${d.topicScope.map((id) => topicNameMap.get(id) ?? id.slice(0, 8)).join(", ")})`}
                      </span>
                    </div>
                    <RevokeButton assemblyId={assemblyId!} delegationId={d.id} onRevoked={refetch} />
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Chain resolver */}
        <ChainResolver
          assemblyId={assemblyId!}
          participants={participants}
          events={events}
          nameMap={nameMap}
        />
      </div>
    </div>
  );
}

function CreateDelegationForm({
  assemblyId,
  participants,
  isTopicScoped,
  onClose,
  onCreated,
}: {
  assemblyId: string;
  participants: Array<{ id: string; name: string }>;
  isTopicScoped: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { participantId } = useIdentity();
  const [sourceId, setSourceId] = useState(participantId ?? "");
  const [targetId, setTargetId] = useState("");
  const [scopeMode, setScopeMode] = useState<"global" | "topics">("global");
  const [topicScope, setTopicScope] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const resolvedScope = scopeMode === "topics" ? topicScope : [];
      await api.createDelegation(assemblyId, { sourceId, targetId, topicScope: resolvedScope });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to set up delegation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">Trust someone with your vote</h3>
          {formError && <ErrorBox message={formError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>From</Label>
              <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Select member...</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>To (Trusted delegate)</Label>
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Select member...</option>
                {participants.filter((p) => p.id !== sourceId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>
          {isTopicScoped && (
            <div>
              <Label>Scope</Label>
              <div className="space-y-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={scopeMode === "global"}
                    onChange={() => setScopeMode("global")}
                    className="text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-gray-700">All topics (trust on everything)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={scopeMode === "topics"}
                    onChange={() => setScopeMode("topics")}
                    className="text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-gray-700">Specific topics</span>
                </label>
                {scopeMode === "topics" && (
                  <div className="ml-6 mt-1 bg-gray-50 rounded-md p-2">
                    <TopicPicker
                      assemblyId={assemblyId}
                      value={topicScope}
                      onChange={setTopicScope}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !sourceId || !targetId || (scopeMode === "topics" && topicScope.length === 0)}>
              {submitting ? "Creating..." : "Delegate"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function ChainResolver({
  assemblyId,
  participants,
  events,
  nameMap,
}: {
  assemblyId: string;
  participants: Array<{ id: string; name: string }>;
  events: Array<{ id: string; title: string; issueIds?: string[] }>;
  nameMap: Map<string, string>;
}) {
  const { participantId: myId } = useIdentity();
  const [selectedParticipant, setSelectedParticipant] = useState(myId ?? "");
  const [selectedIssue, setSelectedIssue] = useState("");
  const [chain, setChain] = useState<DelegationChain | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  const allIssues = events.flatMap((evt) =>
    (evt.issueIds ?? []).map((id) => ({ id, eventTitle: evt.title })),
  );

  const resolveChain = async () => {
    if (!selectedParticipant || !selectedIssue) return;
    setChainLoading(true);
    setChainError(null);
    try {
      const result = await api.resolveChain(assemblyId, selectedParticipant, selectedIssue);
      setChain(result);
    } catch (err: unknown) {
      setChainError(err instanceof Error ? err.message : "Failed to resolve chain");
    } finally {
      setChainLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium text-gray-900">How your vote flows</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          Trace how a member's vote flows through their trusted delegates.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Member</Label>
            <Select value={selectedParticipant} onChange={(e) => setSelectedParticipant(e.target.value)}>
              <option value="">Select...</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Question</Label>
            <Select value={selectedIssue} onChange={(e) => setSelectedIssue(e.target.value)}>
              <option value="">Select...</option>
              {allIssues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.id.slice(0, 8)}... ({issue.eventTitle})
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Button
          onClick={resolveChain}
          disabled={!selectedParticipant || !selectedIssue || chainLoading}
          className="w-full sm:w-auto"
        >
          {chainLoading ? "Tracing..." : "Trace vote path"}
        </Button>

        {chainError && <ErrorBox message={chainError} />}

        {chain && (
          <div className="mt-4">
            <ChainVisualization chain={chain} nameMap={nameMap} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ChainVisualization({ chain, nameMap }: { chain: DelegationChain; nameMap: Map<string, string> }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      {/* Vertical on mobile, horizontal on desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-wrap">
        {chain.chain.map((pid, idx) => {
          const isFirst = idx === 0;
          const isTerminal = pid === chain.terminalVoter;

          return (
            <div key={`${pid}-${idx}`} className="flex flex-col sm:flex-row items-center gap-2">
              {idx > 0 && (
                <>
                  {/* Vertical arrow on mobile */}
                  <svg className="w-5 h-5 text-gray-400 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                  </svg>
                  {/* Horizontal arrow on desktop */}
                  <svg className="w-5 h-5 text-gray-400 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
              <div
                className={`px-4 py-2.5 rounded-md text-sm font-medium w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 ${
                  isTerminal
                    ? "bg-brand text-white"
                    : isFirst
                      ? "bg-white border-2 border-brand text-brand"
                      : "bg-white border border-gray-300 text-gray-700"
                }`}
              >
                <Avatar name={nameMap.get(pid) ?? pid} size="xs" />
                {nameMap.get(pid) ?? pid.slice(0, 8)}
                {isTerminal && <span className="ml-1 text-xs opacity-75">(voter)</span>}
                {isFirst && !isTerminal && <span className="ml-1 text-xs opacity-75">(source)</span>}
              </div>
            </div>
          );
        })}
      </div>
      {chain.votedDirectly && (
        <p className="text-xs text-gray-500 mt-3">Direct vote — delegation overridden.</p>
      )}
      {!chain.terminalVoter && (
        <p className="text-xs text-red-500 mt-3">Chain unresolved (cycle or no terminal voter).</p>
      )}
    </div>
  );
}

function RevokeButton({ assemblyId, delegationId, onRevoked }: { assemblyId: string; delegationId: string; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState(false);

  const handleRevoke = async () => {
    try {
      await api.revokeDelegation(assemblyId, delegationId);
      onRevoked();
    } catch {
      // silently ignore
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="danger" onClick={handleRevoke}>Yes</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-red-500 hover:text-red-700 shrink-0">
      Remove
    </Button>
  );
}
