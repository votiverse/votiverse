import { useMemo } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { TopicIssueItem, TopicDelegationItem } from "../api/types.js";
import { Card, CardBody, Badge, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";

export function TopicPage() {
  const { assemblyId, topicId } = useParams();

  const { data: topicsData, loading: topicsLoading } = useApi(
    () => api.listTopics(assemblyId!),
    [assemblyId],
  );
  const { data: issuesData, loading: issuesLoading, error, refetch } = useApi(
    () => api.getTopicIssues(assemblyId!, topicId!),
    [assemblyId, topicId],
  );
  const { data: delegationsData } = useApi(
    () => api.getTopicDelegations(assemblyId!, topicId!),
    [assemblyId, topicId],
  );

  const topics = topicsData?.topics ?? [];
  const topic = useMemo(() => topics.find((t) => t.id === topicId), [topics, topicId]);
  const parent = useMemo(
    () => (topic?.parentId ? topics.find((t) => t.id === topic.parentId) : null),
    [topics, topic],
  );
  const children = useMemo(
    () => topics.filter((t) => t.parentId === topicId).sort((a, b) => a.sortOrder - b.sortOrder),
    [topics, topicId],
  );

  const issues = issuesData?.issues ?? [];
  const delegations = delegationsData?.delegations ?? [];

  const loading = topicsLoading || issuesLoading;
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;
  if (!topic) return <ErrorBox message="Topic not found" />;

  const now = Date.now();
  const activeIssues = issues.filter((i) => {
    const vs = new Date(i.event.timeline.votingStart).getTime();
    const ve = new Date(i.event.timeline.votingEnd).getTime();
    return vs <= now && now < ve && !i.issue.cancelled;
  });
  const closedIssues = issues.filter((i) => {
    const ve = new Date(i.event.timeline.votingEnd).getTime();
    return now >= ve || i.issue.cancelled;
  });
  const upcomingIssues = issues.filter((i) => {
    const vs = new Date(i.event.timeline.votingStart).getTime();
    return now < vs && !i.issue.cancelled;
  });

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-1 text-xs text-gray-400 flex items-center gap-1">
        <Link
          to={`/assembly/${assemblyId}/topics`}
          className="hover:text-gray-600 transition-colors"
        >
          Topics
        </Link>
        {parent && (
          <>
            <span>›</span>
            <Link
              to={`/assembly/${assemblyId}/topics/${parent.id}`}
              className="hover:text-gray-600 transition-colors"
            >
              {parent.name}
            </Link>
          </>
        )}
        <span>›</span>
        <span className="text-gray-500">{topic.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{topic.name}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
          <span>{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
          <span>{delegations.length} delegate{delegations.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Child topics (root topics only) */}
      {children.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Subtopics</h2>
          <div className="flex flex-wrap gap-2">
            {children.map((child) => (
              <Link
                key={child.id}
                to={`/assembly/${assemblyId}/topics/${child.id}`}
                className="text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1 transition-colors"
              >
                {child.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Issues section */}
      <IssuesSection
        assemblyId={assemblyId!}
        label="Active"
        issues={activeIssues}
        showBadge
      />
      <IssuesSection
        assemblyId={assemblyId!}
        label="Upcoming"
        issues={upcomingIssues}
      />
      <IssuesSection
        assemblyId={assemblyId!}
        label="Closed"
        issues={closedIssues}
      />

      {issues.length === 0 && delegations.length === 0 && (
        <EmptyState
          title="No activity yet"
          description="No issues or delegations have been created for this topic."
        />
      )}

      {/* Delegations section */}
      {delegations.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Delegates ({delegations.length})
          </h2>
          <Card>
            <CardBody className="divide-y divide-gray-100">
              {delegations.map((d) => (
                <DelegateRow key={d.delegate.id} item={d} />
              ))}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function IssuesSection({
  assemblyId,
  label,
  issues,
  showBadge,
}: {
  assemblyId: string;
  label: string;
  issues: TopicIssueItem[];
  showBadge?: boolean;
}) {
  if (issues.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        {label}
        {showBadge && (
          <Badge color="green">{issues.length}</Badge>
        )}
      </h2>
      <div className="space-y-2">
        {issues.map((item) => (
          <IssueRow key={item.issue.id} item={item} assemblyId={assemblyId} />
        ))}
      </div>
    </div>
  );
}

function IssueRow({ item, assemblyId }: { item: TopicIssueItem; assemblyId: string }) {
  const { issue, event } = item;

  return (
    <Link
      to={`/assembly/${assemblyId}/events/${event.id}`}
      className="block"
    >
      <Card className="hover:border-gray-300 transition-colors">
        <CardBody className="py-3">
          <p className={`text-sm font-medium text-gray-900 ${issue.cancelled ? "line-through opacity-50" : ""}`}>
            {issue.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {event.title}
            {issue.cancelled && (
              <span className="ml-2 text-red-400">Cancelled</span>
            )}
          </p>
        </CardBody>
      </Card>
    </Link>
  );
}

function DelegateRow({ item }: { item: TopicDelegationItem }) {
  const { delegate, delegators, totalWeight } = item;

  return (
    <div className="flex items-center justify-between py-3 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={delegate.name} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{delegate.name}</p>
          <p className="text-xs text-gray-400 truncate">
            {delegators.map((d) => d.name).join(", ")}
          </p>
        </div>
      </div>
      <span className="text-xs text-gray-500 tabular-nums shrink-0">
        {totalWeight}× weight
      </span>
    </div>
  );
}
