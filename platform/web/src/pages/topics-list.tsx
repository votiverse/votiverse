import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useAssemblyRole } from "../hooks/use-assembly-role.js";
import { useMyDelegations, resolveRootTopicDelegation } from "../hooks/use-my-delegations.js";
import * as api from "../api/client.js";
import type { Topic, VotingEvent, Delegation } from "../api/types.js";
import { Card, CardBody, Button, Input, Select, Label, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { DelegatedIcon } from "../components/delegated-icon.js";
import type { TopicDelegationStatus } from "../hooks/use-my-delegations.js";

interface TopicNode {
  topic: Topic;
  children: Topic[];
  issueCount: number;
  delegationCount: number;
}

function buildTree(
  topics: Topic[],
  events: VotingEvent[],
  delegations: Delegation[],
): TopicNode[] {
  // Build topic ID sets per root (root + its children)
  const childMap = new Map<string | null, Topic[]>();
  for (const t of topics) {
    const key = t.parentId ?? "__root__";
    const siblings = childMap.get(key) ?? [];
    siblings.push(t);
    childMap.set(key, siblings);
  }
  const roots = (childMap.get("__root__") ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

  // Collect all issue topicIds from events
  const allIssues = events.flatMap((e) => e.issues ?? []);

  return roots.map((root) => {
    const children = (childMap.get(root.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    const relevantIds = new Set([root.id, ...children.map((c) => c.id)]);

    const issueCount = allIssues.filter((i) => i.topicId && relevantIds.has(i.topicId)).length;
    const delegationCount = delegations.filter(
      (d) => d.topicScope.length === 0 || d.topicScope.some((ts) => relevantIds.has(ts)),
    ).length;

    return { topic: root, children, issueCount, delegationCount };
  });
}

export function TopicsList() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { isAdmin } = useAssemblyRole(assemblyId);
  const { data: topicsData, loading, error, refetch } = useApi(
    () => api.listTopics(assemblyId!),
    [assemblyId],
  );
  const { data: eventsData } = useApi(
    () => api.listEvents(assemblyId!),
    [assemblyId],
  );
  const { data: delegationsData } = useApi(
    () => api.listDelegations(assemblyId!),
    [assemblyId],
  );
  const { myDelegations, participantNames } = useMyDelegations();

  const topics = topicsData?.topics ?? [];
  const [showCreateForm, setShowCreateForm] = useState(false);

  const tree = useMemo(
    () => buildTree(
      topics,
      eventsData?.events ?? [],
      delegationsData?.delegations ?? [],
    ),
    [topics, eventsData, delegationsData],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("topicsList.title")}</h1>
          <p className="text-sm text-text-muted mt-1">
            {t("topicsList.subtitle")}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateForm(!showCreateForm)} variant={showCreateForm ? "secondary" : undefined}>
            {showCreateForm ? t("common:cancel") : t("topicsList.newTopic")}
          </Button>
        )}
      </div>

      {showCreateForm && (
        <CreateTopicForm
          assemblyId={assemblyId!}
          rootTopics={topics.filter((t) => !t.parentId)}
          onCreated={() => { setShowCreateForm(false); refetch(); }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {tree.length === 0 ? (
        <EmptyState title={t("topicsList.noTopics")} description={t("topicsList.noTopicsDesc")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tree.map((node) => (
            <TopicCard
              key={node.topic.id}
              node={node}
              assemblyId={assemblyId!}
              delegationStatus={
                myDelegations.length > 0
                  ? resolveRootTopicDelegation(node.topic.id, topics, myDelegations, participantNames)
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTopicForm({
  assemblyId,
  rootTopics,
  onCreated,
  onCancel,
}: {
  assemblyId: string;
  rootTopics: Topic[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("governance");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createTopic(assemblyId, {
        name: name.trim(),
        parentId: parentId || null,
      });
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("topicsList.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">{t("topicsList.newTopicTitle")}</h3>
          {formError && <ErrorBox message={formError} />}
          <div>
            <Label>{t("topicsList.topicName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("topicsList.topicNamePlaceholder")}
              autoFocus
            />
          </div>
          {rootTopics.length > 0 && (
            <div>
              <Label>{t("topicsList.parentTopic")}</Label>
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{t("topicsList.noParent")}</option>
                {rootTopics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <p className="text-xs text-text-tertiary mt-1">{t("topicsList.parentHint")}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? t("topicsList.creating") : t("topicsList.createBtn")}
            </Button>
            <button
              type="button"
              onClick={onCancel}
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

function TopicCard({
  node,
  assemblyId,
  delegationStatus,
}: {
  node: TopicNode;
  assemblyId: string;
  delegationStatus: TopicDelegationStatus | null;
}) {
  const { t } = useTranslation("governance");
  const { topic, children, issueCount, delegationCount } = node;
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:border-border-strong transition-colors"
      onClick={() => navigate(`/assembly/${assemblyId}/topics/${topic.id}`)}
    >
      <CardBody>
        <div className="flex items-start justify-between gap-2">
          <span className="text-base font-semibold text-text-primary">
            {topic.name}
          </span>
          {delegationStatus && (
            <span title={delegationStatus.label}>
              <DelegatedIcon size={18} className="text-info-text shrink-0 mt-0.5" />
            </span>
          )}
        </div>

        {children.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {children.map((child) => (
              <Link
                key={child.id}
                to={`/assembly/${assemblyId}/topics/${child.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-text-muted hover:text-text-secondary bg-surface-sunken hover:bg-interactive-active rounded-full px-2.5 py-0.5 transition-colors"
              >
                {child.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
          <span>{t("topicsList.issue", { count: issueCount })}</span>
          <span>{t("topicsList.delegation", { count: delegationCount })}</span>
        </div>
      </CardBody>
    </Card>
  );
}
