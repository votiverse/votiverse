import { useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useMyDelegations, resolveRootTopicDelegation } from "../hooks/use-my-delegations.js";
import * as api from "../api/client.js";
import type { Topic, VotingEvent, Delegation } from "../api/types.js";
import { Card, CardBody, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
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

  if (tree.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">{t("topicsList.title")}</h1>
        <EmptyState title={t("topicsList.noTopics")} description={t("topicsList.noTopicsDesc")} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{t("topicsList.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("topicsList.subtitle")}
        </p>
      </div>

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
    </div>
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
      className="cursor-pointer hover:border-gray-300 transition-colors"
      onClick={() => navigate(`/assembly/${assemblyId}/topics/${topic.id}`)}
    >
      <CardBody>
        <div className="flex items-start justify-between gap-2">
          <span className="text-base font-semibold text-gray-900">
            {topic.name}
          </span>
          {delegationStatus && (
            <span title={delegationStatus.label}>
              <DelegatedIcon size={18} className="text-blue-400 shrink-0 mt-0.5" />
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
                className="text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-0.5 transition-colors"
              >
                {child.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
          <span>{t("topicsList.issue", { count: issueCount })}</span>
          <span>{t("topicsList.delegation", { count: delegationCount })}</span>
        </div>
      </CardBody>
    </Card>
  );
}
