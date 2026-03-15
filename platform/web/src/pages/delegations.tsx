import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Delegation, DelegationChain } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Select, Label, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { TopicPicker } from "../components/topic-picker.js";

type Tab = "mine" | "assembly";

export function Delegations() {
  const { assemblyId } = useParams();
  const { participantId, participantName } = useIdentity();
  const { assembly } = useAssembly(assemblyId);
  const { data, loading, error, refetch } = useApi(() => api.listDelegations(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: eventsData } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);

  const visibilityMode = assembly?.config.delegation.visibility?.mode ?? "public";
  const showAssemblyTab = visibilityMode === "public";
  const [tab, setTab] = useState<Tab>("mine");

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  const allDelegations = data?.delegations ?? [];
  const participants = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const topicNameMap = new Map((topicsData?.topics ?? []).map((t) => [t.id, t.name]));
  const isTopicScoped = assembly?.config.delegation.topicScoped ?? false;

  // Split delegations into mine vs all
  const myOutgoing = allDelegations.filter((d) => d.sourceId === participantId);
  const myIncoming = allDelegations.filter((d) => d.targetId === participantId);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Delegates</h1>
      </div>

      {/* Tab bar */}
      {showAssemblyTab && (
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
            My Delegations
          </TabButton>
          <TabButton active={tab === "assembly"} onClick={() => setTab("assembly")}>
            Assembly Delegations
          </TabButton>
        </div>
      )}

      {tab === "mine" ? (
        <MyDelegationsTab
          assemblyId={assemblyId!}
          participantId={participantId}
          participantName={participantName}
          myOutgoing={myOutgoing}
          myIncoming={myIncoming}
          participants={participants}
          events={events}
          nameMap={nameMap}
          topicNameMap={topicNameMap}
          isTopicScoped={isTopicScoped}
          visibilityMode={visibilityMode}
          refetch={refetch}
        />
      ) : (
        <AssemblyDelegationsTab
          assemblyId={assemblyId!}
          allDelegations={allDelegations}
          participants={participants}
          events={events}
          nameMap={nameMap}
          topicNameMap={topicNameMap}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
        active
          ? "border-brand text-brand"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: My Delegations — always visible
// ---------------------------------------------------------------------------

function MyDelegationsTab({
  assemblyId,
  participantId,
  participantName,
  myOutgoing,
  myIncoming,
  participants,
  events,
  nameMap,
  topicNameMap,
  isTopicScoped,
  visibilityMode,
  refetch,
}: {
  assemblyId: string;
  participantId: string | null;
  participantName: string | null;
  myOutgoing: Delegation[];
  myIncoming: Delegation[];
  participants: Array<{ id: string; name: string }>;
  events: Array<{ id: string; title: string; issueIds?: string[] }>;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  isTopicScoped: boolean;
  visibilityMode: "public" | "private";
  refetch: () => void;
}) {
  const [creating, setCreating] = useState(false);

  if (!participantId) {
    return (
      <EmptyState
        title="No identity"
        description="Go to Home and pick who you are to view your delegations."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Create delegation button */}
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>Trust someone with your vote</Button>
      </div>

      {creating && (
        <CreateDelegationForm
          assemblyId={assemblyId}
          participantId={participantId}
          participantName={participantName}
          participants={participants}
          isTopicScoped={isTopicScoped}
          onClose={() => setCreating(false)}
          onCreated={refetch}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* My outgoing delegations */}
        <Card>
          <CardHeader>
            <h2 className="font-medium text-gray-900">People you trust</h2>
            <p className="text-xs text-gray-400 mt-0.5">Your outgoing delegations</p>
          </CardHeader>
          <CardBody>
            {myOutgoing.length === 0 ? (
              <EmptyState
                title="No delegates"
                description="You haven't trusted anyone with your vote yet."
              />
            ) : (
              <div className="space-y-2">
                {myOutgoing.map((d) => (
                  <DelegationRow
                    key={d.id}
                    delegation={d}
                    nameMap={nameMap}
                    topicNameMap={topicNameMap}
                    showSource={false}
                    revokeSlot={
                      <RevokeButton
                        assemblyId={assemblyId}
                        delegationId={d.id}
                        onRevoked={refetch}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* My incoming delegations */}
        <Card>
          <CardHeader>
            <h2 className="font-medium text-gray-900">People who trust you</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {myIncoming.length > 0
                ? `${myIncoming.length} member${myIncoming.length !== 1 ? "s" : ""} delegated to you`
                : "No one has delegated to you yet"
              }
            </p>
          </CardHeader>
          <CardBody>
            {myIncoming.length === 0 ? (
              <EmptyState
                title="No incoming delegations"
                description="When other members trust you with their vote, they'll appear here."
              />
            ) : (
              <div className="space-y-2">
                {myIncoming.map((d) => (
                  <DelegationRow
                    key={d.id}
                    delegation={d}
                    nameMap={nameMap}
                    topicNameMap={topicNameMap}
                    showSource
                    showTarget={false}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Chain resolver — own chain only in private mode */}
      <ChainResolver
        assemblyId={assemblyId}
        participants={participants}
        events={events}
        nameMap={nameMap}
        restrictToSelf={visibilityMode === "private"}
        selfId={participantId}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Assembly Delegations — only when visibility.mode === 'public'
// ---------------------------------------------------------------------------

function AssemblyDelegationsTab({
  assemblyId,
  allDelegations,
  participants,
  events,
  nameMap,
  topicNameMap,
}: {
  assemblyId: string;
  allDelegations: Delegation[];
  participants: Array<{ id: string; name: string }>;
  events: Array<{ id: string; title: string; issueIds?: string[] }>;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
}) {
  return (
    <div className="space-y-6">
      {/* Read-only list of all delegations */}
      <Card>
        <CardHeader>
          <h2 className="font-medium text-gray-900">All Delegations</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {allDelegations.length} active delegation{allDelegations.length !== 1 ? "s" : ""} in this group
          </p>
        </CardHeader>
        <CardBody>
          {allDelegations.length === 0 ? (
            <EmptyState
              title="No delegations"
              description="No one in this group has delegated their vote yet."
            />
          ) : (
            <div className="space-y-2">
              {allDelegations.map((d) => (
                <DelegationRow
                  key={d.id}
                  delegation={d}
                  nameMap={nameMap}
                  topicNameMap={topicNameMap}
                  showSource
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Chain resolver — any participant */}
      <ChainResolver
        assemblyId={assemblyId}
        participants={participants}
        events={events}
        nameMap={nameMap}
        restrictToSelf={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Delegation row
// ---------------------------------------------------------------------------

function DelegationRow({
  delegation: d,
  nameMap,
  topicNameMap,
  showSource = true,
  showTarget = true,
  revokeSlot,
}: {
  delegation: Delegation;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  showSource?: boolean;
  showTarget?: boolean;
  revokeSlot?: React.ReactNode;
}) {
  const sourceName = nameMap.get(d.sourceId) ?? d.sourceId.slice(0, 8);
  const targetName = nameMap.get(d.targetId) ?? d.targetId.slice(0, 8);
  const scopeLabel =
    d.topicScope.length === 0
      ? "all topics"
      : d.topicScope.map((id) => topicNameMap.get(id) ?? id.slice(0, 8)).join(", ");

  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-md px-3 sm:px-4 py-3 gap-2 min-h-[52px]">
      <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0 flex-wrap">
        {showSource && (
          <>
            <Avatar name={sourceName} size="xs" />
            <span className="font-medium text-gray-900 truncate">{sourceName}</span>
          </>
        )}
        {showSource && showTarget && (
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        )}
        {showTarget && (
          <>
            <Avatar name={targetName} size="xs" />
            <span className="font-medium text-brand truncate">{targetName}</span>
          </>
        )}
        <span className="text-xs text-gray-400">({scopeLabel})</span>
      </div>
      {revokeSlot}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create delegation form — source is always the current identity
// ---------------------------------------------------------------------------

function CreateDelegationForm({
  assemblyId,
  participantId,
  participantName,
  participants,
  isTopicScoped,
  onClose,
  onCreated,
}: {
  assemblyId: string;
  participantId: string;
  participantName: string | null;
  participants: Array<{ id: string; name: string }>;
  isTopicScoped: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [scopeMode, setScopeMode] = useState<"global" | "topics">("global");
  const [topicScope, setTopicScope] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const resolvedScope = scopeMode === "topics" ? topicScope : [];
      await api.createDelegation(assemblyId, { targetId, topicScope: resolvedScope });
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setFormError(err.message || "You don't have permission to create this delegation.");
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to set up delegation");
      }
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
            {/* Source — read-only, always current identity */}
            <div>
              <Label>From (you)</Label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5 min-h-[42px]">
                <Avatar name={participantName ?? "?"} size="xs" />
                <span className="text-sm font-medium text-gray-700">
                  {participantName ?? participantId}
                </span>
              </div>
            </div>
            <div>
              <Label>To (Trusted delegate)</Label>
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Select member...</option>
                {participants.filter((p) => p.id !== participantId).map((p) => (
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
            <Button type="submit" disabled={submitting || !targetId || (scopeMode === "topics" && topicScope.length === 0)}>
              {submitting ? "Creating..." : "Delegate"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chain resolver
// ---------------------------------------------------------------------------

function ChainResolver({
  assemblyId,
  participants,
  events,
  nameMap,
  restrictToSelf,
  selfId,
}: {
  assemblyId: string;
  participants: Array<{ id: string; name: string }>;
  events: Array<{ id: string; title: string; issueIds?: string[] }>;
  nameMap: Map<string, string>;
  restrictToSelf: boolean;
  selfId?: string | null;
}) {
  const [selectedParticipant, setSelectedParticipant] = useState(selfId ?? "");
  const [selectedIssue, setSelectedIssue] = useState("");
  const [chain, setChain] = useState<DelegationChain | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  const allIssues = events.flatMap((evt) =>
    (evt.issueIds ?? []).map((id) => ({ id, eventTitle: evt.title })),
  );

  const handleResolve = async () => {
    if (!selectedParticipant || !selectedIssue) return;
    setChainLoading(true);
    setChainError(null);
    try {
      const result = await api.resolveChain(assemblyId, selectedParticipant, selectedIssue);
      setChain(result);
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setChainError("You can only trace your own vote chain in this group.");
      } else {
        setChainError(err instanceof Error ? err.message : "Failed to resolve chain");
      }
    } finally {
      setChainLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium text-gray-900">
          {restrictToSelf ? "How your vote flows" : "Trace any member's vote path"}
        </h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          {restrictToSelf
            ? "See where your vote ends up through your trusted delegates."
            : "Trace how a member's vote flows through their trusted delegates."
          }
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Member</Label>
            {restrictToSelf && selfId ? (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5 min-h-[42px]">
                <Avatar name={nameMap.get(selfId) ?? "?"} size="xs" />
                <span className="text-sm font-medium text-gray-700">
                  {nameMap.get(selfId) ?? selfId.slice(0, 8)}
                </span>
              </div>
            ) : (
              <Select value={selectedParticipant} onChange={(e) => setSelectedParticipant(e.target.value)}>
                <option value="">Select...</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            )}
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
          onClick={handleResolve}
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

// ---------------------------------------------------------------------------
// Chain visualization (unchanged from previous)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Revoke button — with 403 handling
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
    return (
      <span className="text-xs text-red-500 shrink-0">{revokeError}</span>
    );
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
