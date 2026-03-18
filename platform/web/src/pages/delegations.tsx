import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Delegation } from "../api/types.js";
import { Card, CardBody, Button, Label, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { TopicPicker } from "../components/topic-picker.js";
import { MemberSearch } from "../components/member-search.js";
import type { Candidacy } from "../api/types.js";

export function Delegations() {
  const { assemblyId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { assembly } = useAssembly(assemblyId);
  const { data, loading, error, refetch } = useApi(() => api.listDelegations(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);
  const delegationMode = assembly?.config.delegation.delegationMode ?? "none";
  const { data: candidaciesData } = useApi(
    () => delegationMode === "candidacy" ? api.listCandidacies(assemblyId!, "active") : Promise.resolve({ candidacies: [] }),
    [assemblyId, delegationMode],
  );

  const isTopicScoped = assembly?.config.delegation.topicScoped ?? false;

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  if (!participantId) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">Your Delegates</h1>
        <EmptyState
          title="No identity"
          description="Go to Home and pick who you are to view your delegations."
        />
      </div>
    );
  }

  const allDelegations = data?.delegations ?? [];
  const participants = participantsData?.participants ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const topicNameMap = new Map((topicsData?.topics ?? []).map((t) => [t.id, t.name]));

  const myOutgoing = allDelegations.filter((d) => d.sourceId === participantId);
  const myIncoming = allDelegations.filter((d) => d.targetId === participantId);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Your Delegates</h1>
        <p className="text-sm text-gray-500 mt-1">
          When you can't follow every topic, let someone you choose vote for you.
          You can always override with a direct vote.
        </p>
      </div>

      {/* Outgoing delegations section */}
      <DelegatesList
        assemblyId={assemblyId!}
        participantId={participantId}
        myOutgoing={myOutgoing}
        participants={participants}
        nameMap={nameMap}
        topicNameMap={topicNameMap}
        isTopicScoped={isTopicScoped}
        candidates={candidaciesData?.candidacies ?? []}
        delegationMode={delegationMode}
        refetch={refetch}
      />

      {/* Incoming delegations — collapsed */}
      <IncomingSection
        myIncoming={myIncoming}
        nameMap={nameMap}
        topicNameMap={topicNameMap}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outgoing delegations list
// ---------------------------------------------------------------------------

function DelegatesList({
  assemblyId,
  participantId,
  myOutgoing,
  participants,
  nameMap,
  topicNameMap,
  isTopicScoped,
  candidates,
  delegationMode,
  refetch,
}: {
  assemblyId: string;
  participantId: string;
  myOutgoing: Delegation[];
  participants: Array<{ id: string; name: string }>;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  isTopicScoped: boolean;
  candidates: Candidacy[];
  delegationMode: string;
  refetch: () => void;
}) {
  const [creating, setCreating] = useState(false);

  if (myOutgoing.length === 0 && !creating) {
    return (
      <div className="mb-8">
        <Card>
          <CardBody className="py-10 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <h3 className="font-medium text-gray-900 mb-1">No delegates yet</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-5">
              When you can't follow every topic, you can let someone you choose vote for you.
              Your direct vote always overrides any delegation.
            </p>
            <Button onClick={() => setCreating(true)}>Delegate your vote</Button>
          </CardBody>
        </Card>

        {creating && (
          <CreateDelegationForm
            assemblyId={assemblyId}
            participantId={participantId}
            participants={participants}
            isTopicScoped={isTopicScoped}
            candidates={candidates}
            delegationMode={delegationMode}
            topicNameMap={topicNameMap}
            onClose={() => setCreating(false)}
            onCreated={() => { refetch(); setCreating(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      {/* CTA + list */}
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} variant="secondary">
          + Delegate your vote
        </Button>
      </div>

      {creating && (
        <CreateDelegationForm
          assemblyId={assemblyId}
          participantId={participantId}
          participants={participants}
          isTopicScoped={isTopicScoped}
          candidates={candidates}
          delegationMode={delegationMode}
          topicNameMap={topicNameMap}
          onClose={() => setCreating(false)}
          onCreated={() => { refetch(); setCreating(false); }}
        />
      )}

      <Card>
        <CardBody className="divide-y divide-gray-100">
          {myOutgoing.map((d) => (
            <DelegationRow
              key={d.id}
              delegation={d}
              nameMap={nameMap}
              topicNameMap={topicNameMap}
              revokeSlot={
                <RevokeButton
                  assemblyId={assemblyId}
                  delegationId={d.id}
                  onRevoked={refetch}
                />
              }
            />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delegation row — shows delegate info, scope, and optional revoke
// ---------------------------------------------------------------------------

function DelegationRow({
  delegation: d,
  nameMap,
  topicNameMap,
  revokeSlot,
}: {
  delegation: Delegation;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  revokeSlot?: React.ReactNode;
}) {
  const targetName = nameMap.get(d.targetId) ?? d.targetId.slice(0, 8);
  const scopeLabel =
    d.topicScope.length === 0
      ? "All topics"
      : d.topicScope.map((id) => topicNameMap.get(id) ?? id.slice(0, 8)).join(", ");
  const since = new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex items-center justify-between py-3 gap-3 min-h-[56px]">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={targetName} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{targetName}</p>
          <p className="text-xs text-gray-400 truncate">{scopeLabel} · Since {since}</p>
        </div>
      </div>
      {revokeSlot}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incoming delegations — collapsed section
// ---------------------------------------------------------------------------

function IncomingSection({
  myIncoming,
  nameMap,
  topicNameMap,
}: {
  myIncoming: Delegation[];
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (myIncoming.length === 0) return null;

  return (
    <div className="border-t border-gray-200 pt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 w-full text-left min-h-[36px]"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>
          {myIncoming.length} member{myIncoming.length !== 1 ? "s" : ""} delegate{myIncoming.length === 1 ? "s" : ""} to you
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-1">
          {myIncoming.map((d) => {
            const sourceName = nameMap.get(d.sourceId) ?? d.sourceId.slice(0, 8);
            const scopeLabel =
              d.topicScope.length === 0
                ? "all topics"
                : d.topicScope.map((id) => topicNameMap.get(id) ?? id.slice(0, 8)).join(", ");
            return (
              <div key={d.id} className="flex items-center gap-2 text-sm text-gray-600 pl-6 py-1.5">
                <Avatar name={sourceName} size="xs" />
                <span className="truncate">{sourceName}</span>
                <span className="text-xs text-gray-400">({scopeLabel})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create delegation form — source is always the current identity
// ---------------------------------------------------------------------------

function CreateDelegationForm({
  assemblyId,
  participantId,
  participants,
  isTopicScoped,
  candidates,
  delegationMode,
  topicNameMap,
  onClose,
  onCreated,
}: {
  assemblyId: string;
  participantId: string;
  participants: Array<{ id: string; name: string }>;
  isTopicScoped: boolean;
  candidates: Candidacy[];
  delegationMode: string;
  topicNameMap: Map<string, string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [scopeMode, setScopeMode] = useState<"global" | "topics">("global");
  const [topicScope, setTopicScope] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedName = participants.find((p) => p.id === targetId)?.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const resolvedScope = scopeMode === "topics" ? topicScope : [];
      await api.createDelegation(assemblyId, { targetId, topicScope: resolvedScope });
      onCreated();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setFormError(err.message || "You don't have permission to create this delegation.");
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to create delegation");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">Delegate your vote</h3>
          {formError && <ErrorBox message={formError} />}

          {/* Delegate picker */}
          <div>
            <Label>Who should vote for you?</Label>
            {targetId ? (
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                <Avatar name={selectedName ?? "?"} size="sm" />
                <span className="text-sm font-medium text-gray-900 flex-1">{selectedName}</span>
                <button
                  type="button"
                  onClick={() => setTargetId("")}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Change
                </button>
              </div>
            ) : (
              <MemberSearch
                participants={participants}
                currentParticipantId={participantId}
                onSelect={setTargetId}
                candidates={delegationMode === "candidacy" ? candidates : undefined}
                topicNameMap={topicNameMap}
                placeholder={delegationMode === "candidacy"
                  ? "Browse candidates or search any member..."
                  : "Search for a member by name..."}
              />
            )}
          </div>

          {/* Scope selector */}
          {isTopicScoped && (
            <div>
              <Label>Scope</Label>
              <div className="space-y-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="page-scope"
                    checked={scopeMode === "global"}
                    onChange={() => setScopeMode("global")}
                    className="text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-gray-700">All topics</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="page-scope"
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting || !targetId || (scopeMode === "topics" && topicScope.length === 0)}>
              {submitting ? "Delegating..." : "Delegate"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 min-h-[36px] px-2"
            >
              Cancel
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Revoke button — with confirmation and 403 handling
// ---------------------------------------------------------------------------

function RevokeButton({ assemblyId, delegationId, onRevoked }: { assemblyId: string; delegationId: string; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleRevoke = async () => {
    setRevokeError(null);
    try {
      await api.revokeDelegation(assemblyId, delegationId);
      onRevoked();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setRevokeError("Only the delegator can remove their own delegation.");
      } else {
        setRevokeError("Failed to remove delegation.");
      }
      setConfirming(false);
    }
  };

  if (revokeError) {
    return <span className="text-xs text-red-500 shrink-0">{revokeError}</span>;
  }

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
