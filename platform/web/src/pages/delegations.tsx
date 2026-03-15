import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { DelegationChain } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Select, Label, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";

export function Delegations() {
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listDelegations(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: eventsData } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const [creating, setCreating] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  const delegations = data?.delegations ?? [];
  const participants = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Delegations</h1>
        <Button onClick={() => setCreating(true)}>Set Delegation</Button>
      </div>

      {creating && (
        <CreateDelegationForm
          assemblyId={assemblyId!}
          participants={participants}
          onClose={() => setCreating(false)}
          onCreated={refetch}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Active delegations */}
        <Card>
          <CardHeader>
            <h2 className="font-medium text-gray-900">Active Delegations</h2>
          </CardHeader>
          <CardBody>
            {delegations.length === 0 ? (
              <EmptyState title="No delegations" description="No active delegations in this assembly." />
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
                        {d.topicScope.length === 0 ? "(global)" : `(${d.topicScope.length} topic${d.topicScope.length !== 1 ? "s" : ""})`}
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
  onClose,
  onCreated,
}: {
  assemblyId: string;
  participants: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { participantId } = useIdentity();
  const [sourceId, setSourceId] = useState(participantId ?? "");
  const [targetId, setTargetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createDelegation(assemblyId, { sourceId, targetId, topicScope: [] });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create delegation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">New Delegation</h3>
          {formError && <ErrorBox message={formError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>From (Delegator)</Label>
              <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Select participant...</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>To (Delegate)</Label>
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Select participant...</option>
                {participants.filter((p) => p.id !== sourceId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-gray-400">Global delegation (all topics). Topic-scoped delegation coming soon.</p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !sourceId || !targetId}>
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
        <h2 className="font-medium text-gray-900">Delegation Chain</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          Trace how a participant's vote flows through the delegation chain.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Participant</Label>
            <Select value={selectedParticipant} onChange={(e) => setSelectedParticipant(e.target.value)}>
              <option value="">Select...</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Issue</Label>
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
          {chainLoading ? "Resolving..." : "Resolve Chain"}
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
      Revoke
    </Button>
  );
}
