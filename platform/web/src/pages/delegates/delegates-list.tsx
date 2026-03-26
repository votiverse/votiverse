import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../../api/client.js";
import type { Delegation, Topic } from "../../api/types.js";
import { Card, CardBody, Button, Spinner, ErrorBox, EmptyState } from "../../components/ui.js";
import { Avatar } from "../../components/avatar.js";
import { formatDate } from "../../lib/format.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function topicDisplayName(topicId: string, topics: Topic[]): string {
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) return topicId.slice(0, 8);
  if (topic.parentId) {
    const parent = topics.find((t) => t.id === topic.parentId);
    if (parent) return `${parent.name} › ${topic.name}`;
  }
  return topic.name;
}

// ---------------------------------------------------------------------------
// Level 1: Your Delegates list
// ---------------------------------------------------------------------------

export function DelegatesList({
  assemblyId,
  participantId: _participantId,
  myOutgoing,
  nameMap,
  topics,
  refetch,
  onBrowse,
}: {
  assemblyId: string;
  participantId: string;
  myOutgoing: Delegation[];
  nameMap: Map<string, string>;
  topics: Topic[];
  refetch: () => void;
  onBrowse: () => void;
}) {
  const { t } = useTranslation("governance");

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("delegations.title")}</h1>
          <p className="text-sm text-text-muted mt-1">{t("delegations.subtitle")}</p>
        </div>
        {myOutgoing.length > 0 && (
          <Button onClick={onBrowse} variant="secondary">
            {t("delegates.findDelegate")}
          </Button>
        )}
      </div>

      {myOutgoing.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center">
            <svg className="w-12 h-12 text-text-tertiary mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <h3 className="font-medium text-text-primary mb-1">{t("delegations.noDelegates")}</h3>
            <p className="text-sm text-text-muted max-w-sm mx-auto mb-5">{t("delegations.noDelegatesDesc")}</p>
            <Button onClick={onBrowse}>{t("delegates.findDelegate")}</Button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="divide-y divide-border-subtle">
            {myOutgoing.map((d) => (
              <DelegationRow
                key={d.id}
                delegation={d}
                nameMap={nameMap}
                topics={topics}
                assemblyId={assemblyId}
                revokeSlot={<RevokeButton assemblyId={assemblyId} delegationId={d.id} onRevoked={refetch} />}
              />
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delegation row
// ---------------------------------------------------------------------------

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
// Revoke button with confirmation
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
