import { useState } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import { signal } from "../hooks/use-mutation-signal.js";
import type { Delegation, Topic } from "../api/types.js";
import { Card, CardBody, Button, Label, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { TopicPicker } from "../components/topic-picker.js";
import { MemberSearch } from "../components/member-search.js";
import { formatDate } from "../lib/format.js";
import type { Candidacy } from "../api/types.js";

export function Delegations() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { assembly } = useAssembly(assemblyId);
  const { data, loading, error, refetch } = useApi(() => api.listDelegations(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);
  const delegationCandidacy = assembly?.config.delegation.candidacy ?? false;
  const delegationEnabled = delegationCandidacy || (assembly?.config.delegation.transferable ?? false);
  const { data: candidaciesData } = useApi(
    () => delegationCandidacy ? api.listCandidacies(assemblyId!, "active") : Promise.resolve({ candidacies: [] }),
    [assemblyId, delegationCandidacy],
  );

  const isTopicScoped = delegationEnabled;

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  if (!participantId) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("delegations.title")}</h1>
        <EmptyState
          title={t("delegations.noIdentity")}
          description={t("delegations.noIdentityDesc")}
        />
      </div>
    );
  }

  const allDelegations = data?.delegations ?? [];
  const participants = participantsData?.participants ?? [];
  const topics = topicsData?.topics ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const topicNameMap = new Map(topics.map((t) => [t.id, t.name]));

  // Filter to topic-scoped delegations only (exclude issue-scoped),
  // sorted broadest first: global → root topics → child topics
  const topicParentMap = new Map(topics.map((t) => [t.id, t.parentId]));
  const myOutgoing = allDelegations
    .filter((d) => d.sourceId === participantId && !d.issueScope)
    .sort((a, b) => {
      // Global (empty scope) comes first
      if (a.topicScope.length === 0 && b.topicScope.length > 0) return -1;
      if (a.topicScope.length > 0 && b.topicScope.length === 0) return 1;
      // Root topics before child topics
      const aIsChild = a.topicScope.some((id) => topicParentMap.get(id) !== null);
      const bIsChild = b.topicScope.some((id) => topicParentMap.get(id) !== null);
      if (!aIsChild && bIsChild) return -1;
      if (aIsChild && !bIsChild) return 1;
      // Alphabetical by topic name
      const aName = a.topicScope.map((id) => topicNameMap.get(id) ?? "").join(",");
      const bName = b.topicScope.map((id) => topicNameMap.get(id) ?? "").join(",");
      return aName.localeCompare(bName);
    });

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("delegations.title")}</h1>
        <p className="text-sm text-text-muted mt-1">
          {t("delegations.subtitle")}
        </p>
      </div>

      {/* Outgoing delegations section */}
      <DelegatesList
        assemblyId={assemblyId!}
        participantId={participantId}
        myOutgoing={myOutgoing}
        participants={participants}
        nameMap={nameMap}
        topics={topicsData?.topics ?? []}
        topicNameMap={topicNameMap}
        isTopicScoped={isTopicScoped}
        candidates={candidaciesData?.candidacies ?? []}
        delegationCandidacy={delegationCandidacy}
        refetch={refetch}
      />

      {/* Incoming delegations live on the profile page (/profile/delegators) */}
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
  topics,
  topicNameMap,
  isTopicScoped,
  candidates,
  delegationCandidacy,
  refetch,
}: {
  assemblyId: string;
  participantId: string;
  myOutgoing: Delegation[];
  participants: Array<{ id: string; name: string }>;
  nameMap: Map<string, string>;
  topics: Topic[];
  topicNameMap: Map<string, string>;
  isTopicScoped: boolean;
  candidates: Candidacy[];
  delegationCandidacy: boolean;
  refetch: () => void;
}) {
  const { t } = useTranslation("governance");
  const [creating, setCreating] = useState(false);

  if (myOutgoing.length === 0 && !creating) {
    return (
      <div className="mb-8">
        <Card>
          <CardBody className="py-10 text-center">
            <svg className="w-12 h-12 text-text-tertiary mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <h3 className="font-medium text-text-primary mb-1">{t("delegations.noDelegates")}</h3>
            <p className="text-sm text-text-muted max-w-sm mx-auto mb-5">
              {t("delegations.noDelegatesDesc")}
            </p>
            <Button onClick={() => setCreating(true)}>{t("delegations.delegateYourVote")}</Button>
          </CardBody>
        </Card>

        {creating && (
          <CreateDelegationForm
            assemblyId={assemblyId}
            participantId={participantId}
            participants={participants}
            isTopicScoped={isTopicScoped}
            candidates={candidates}
            delegationCandidacy={delegationCandidacy}
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
          {t("delegations.addDelegate")}
        </Button>
      </div>

      {creating && (
        <CreateDelegationForm
          assemblyId={assemblyId}
          participantId={participantId}
          participants={participants}
          isTopicScoped={isTopicScoped}
          candidates={candidates}
          delegationCandidacy={delegationCandidacy}
          topicNameMap={topicNameMap}
          onClose={() => setCreating(false)}
          onCreated={() => { refetch(); setCreating(false); }}
        />
      )}

      <Card>
        <CardBody className="divide-y divide-border-subtle">
          {myOutgoing.map((d) => (
            <DelegationRow
              key={d.id}
              delegation={d}
              nameMap={nameMap}
              topics={topics}
              assemblyId={assemblyId}
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
// Delegation row — topic-first layout with delegate avatar
// ---------------------------------------------------------------------------

/** Build the full display name for a topic, including parent path. */
function topicDisplayName(topicId: string, topics: Topic[]): string {
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) return topicId.slice(0, 8);
  if (topic.parentId) {
    const parent = topics.find((t) => t.id === topic.parentId);
    if (parent) return `${parent.name} › ${topic.name}`;
  }
  return topic.name;
}

function DelegationRow({
  delegation: d,
  nameMap,
  topics,
  assemblyId,
  revokeSlot,
}: {
  delegation: Delegation;
  nameMap: Map<string, string>;
  topics: Topic[];
  assemblyId?: string;
  revokeSlot?: React.ReactNode;
}) {
  const targetName = nameMap.get(d.targetId) ?? d.targetId.slice(0, 8);
  const { t } = useTranslation("governance");
  const since = formatDate(d.createdAt);

  const scopeLabel = d.topicScope.length === 0
    ? t("delegations.allTopics")
    : d.topicScope.map((id) => topicDisplayName(id, topics)).join(", ");

  const scopeLink = d.topicScope.length === 1 && assemblyId
    ? `/assembly/${assemblyId}/topics/${d.topicScope[0]}`
    : d.topicScope.length === 0 && assemblyId
      ? `/assembly/${assemblyId}/topics`
      : null;

  return (
    <div className="flex items-center justify-between py-3 gap-3 min-h-[56px]">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={targetName} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {scopeLink ? (
              <Link to={scopeLink} className="hover:text-accent-text transition-colors">
                {scopeLabel}
              </Link>
            ) : scopeLabel}
          </p>
          <p className="text-xs text-text-tertiary truncate">
            {targetName} · {since}
          </p>
        </div>
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
  participants,
  isTopicScoped,
  candidates,
  delegationCandidacy,
  topicNameMap,
  onClose,
  onCreated,
}: {
  assemblyId: string;
  participantId: string;
  participants: Array<{ id: string; name: string }>;
  isTopicScoped: boolean;
  candidates: Candidacy[];
  delegationCandidacy: boolean;
  topicNameMap: Map<string, string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation("governance");
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
      signal("attention");
      onCreated();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setFormError(err.message || t("delegate.permissionDenied"));
      } else {
        setFormError(err instanceof Error ? err.message : t("delegations.failedCreate"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-text-primary">{t("delegations.formTitle")}</h3>
          {formError && <ErrorBox message={formError} />}

          {/* Delegate picker */}
          <div>
            <Label>{t("delegate.whoLabel")}</Label>
            {targetId ? (
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                <Avatar name={selectedName ?? "?"} size="sm" />
                <span className="text-sm font-medium text-text-primary flex-1">{selectedName}</span>
                <button
                  type="button"
                  onClick={() => setTargetId("")}
                  className="text-xs text-text-tertiary hover:text-text-secondary"
                >
                  {t("delegations.change")}
                </button>
              </div>
            ) : (
              <MemberSearch
                participants={participants}
                currentParticipantId={participantId}
                onSelect={setTargetId}
                candidates={delegationCandidacy ? candidates : undefined}
                topicNameMap={topicNameMap}
                placeholder={delegationCandidacy
                  ? t("delegations.browseCandidates")
                  : t("delegations.searchMember")}
              />
            )}
          </div>

          {/* Scope selector */}
          {isTopicScoped && (
            <div>
              <Label>{t("delegations.delegateScope")}</Label>
              <div className="space-y-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="page-scope"
                    checked={scopeMode === "global"}
                    onChange={() => setScopeMode("global")}
                    className="text-accent-text focus:ring-focus-ring"
                  />
                  <span className="text-sm text-text-secondary">{t("delegations.allTopics")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="page-scope"
                    checked={scopeMode === "topics"}
                    onChange={() => setScopeMode("topics")}
                    className="text-accent-text focus:ring-focus-ring"
                  />
                  <span className="text-sm text-text-secondary">{t("delegations.specificTopics")}</span>
                </label>
                {scopeMode === "topics" && (
                  <div className="ml-6 mt-1 bg-surface rounded-md p-2">
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
              {submitting ? t("delegations.delegating") : t("delegations.delegateBtn")}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-text-muted hover:text-text-secondary min-h-[36px] px-2"
            >
              {t("common:cancel")}
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
  const { t } = useTranslation("governance");
  const [confirming, setConfirming] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleRevoke = async () => {
    setRevokeError(null);
    try {
      await api.revokeDelegation(assemblyId, delegationId);
      onRevoked();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setRevokeError(t("delegations.revokeOwnOnly"));
      } else {
        setRevokeError(t("delegations.revokeFailed"));
      }
      setConfirming(false);
    }
  };

  if (revokeError) {
    return <span className="text-xs text-error shrink-0">{revokeError}</span>;
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="danger" onClick={handleRevoke}>{t("delegations.confirmYes")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t("delegations.confirmNo")}</Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-error hover:text-error-text shrink-0">
      {t("delegations.remove")}
    </Button>
  );
}
