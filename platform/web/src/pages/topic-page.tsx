import { useMemo } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useMyDelegations, resolveTopicDelegation, type TopicDelegationStatus } from "../hooks/use-my-delegations.js";
import * as api from "../api/client.js";
import type { TopicIssueItem, TopicDelegationItem } from "../api/types.js";
import { Card, CardBody, Badge, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";


export function TopicPage() {
  const { t } = useTranslation("governance");
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
  const { myDelegations, participantNames } = useMyDelegations();

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

  const delegationStatus = useMemo(
    () => topic && myDelegations.length > 0
      ? resolveTopicDelegation(topic.id, topics, myDelegations, participantNames)
      : null,
    [topic, topics, myDelegations, participantNames],
  );

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
      <div className="mb-1 text-xs text-text-tertiary flex items-center gap-1">
        <Link
          to={`/assembly/${assemblyId}/topics`}
          className="hover:text-text-secondary transition-colors"
        >
          {t("topicPage.breadcrumbTopics")}
        </Link>
        {parent && (
          <>
            <span>›</span>
            <Link
              to={`/assembly/${assemblyId}/topics/${parent.id}`}
              className="hover:text-text-secondary transition-colors"
            >
              {parent.name}
            </Link>
          </>
        )}
        <span>›</span>
        <span className="text-text-muted">{topic.name}</span>
      </div>

      {/* Header with delegation status */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">{topic.name}</h1>
          <div className="flex items-center gap-4 text-sm text-text-muted mt-1">
            <span>{t("topicPage.issue", { count: issues.length })}</span>
            <span>{t("topicPage.delegate", { count: delegations.length })}</span>
          </div>
        </div>
        {delegationStatus && (
          <DelegationBadge
            status={delegationStatus}
            assemblyId={assemblyId!}
          />
        )}
      </div>

      {/* Child topics (root topics only) */}
      {children.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-text-secondary mb-2">{t("topicPage.subtopics")}</h2>
          <div className="flex flex-wrap gap-2">
            {children.map((child) => (
              <Link
                key={child.id}
                to={`/assembly/${assemblyId}/topics/${child.id}`}
                className="text-sm text-text-secondary hover:text-text-primary bg-surface-sunken hover:bg-interactive-active rounded-full px-3 py-1 transition-colors"
              >
                {child.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Issues sections */}
      <IssuesSection
        assemblyId={assemblyId!}
        label={t("topicPage.votingNow")}
        issues={activeIssues}
        showBadge
      />
      <IssuesSection
        assemblyId={assemblyId!}
        label={t("topicPage.upcoming")}
        issues={upcomingIssues}
      />
      <IssuesSection
        assemblyId={assemblyId!}
        label={t("topicPage.closed")}
        issues={closedIssues}
      />

      {issues.length === 0 && delegations.length === 0 && (
        <EmptyState
          title={t("topicPage.noActivity")}
          description={t("topicPage.noActivityDesc")}
        />
      )}

      {/* Weight distribution section */}
      {delegations.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-text-secondary mb-3">
            {t("topicPage.weightDistribution")}
          </h2>
          <p className="text-xs text-text-tertiary mb-3">
            {t("topicPage.weightDistributionDesc")}
          </p>
          <Card>
            <CardBody className="divide-y divide-border-subtle">
              {delegations.map((d) => (
                <DelegateRow
                  key={d.delegate.id}
                  item={d}
                  isMyDelegate={delegationStatus?.delegateId === d.delegate.id}
                />
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
      <h2 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
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
  const { t } = useTranslation("governance");
  const { issue, event } = item;

  return (
    <Link
      to={`/assembly/${assemblyId}/events/${event.id}`}
      className="block"
    >
      <Card className="hover:border-border-strong transition-colors">
        <CardBody className="py-3">
          <p className={`text-sm font-medium text-text-primary ${issue.cancelled ? "line-through opacity-50" : ""}`}>
            {issue.title}
          </p>
          <p className="text-xs text-text-tertiary mt-0.5">
            {event.title}
            {issue.cancelled && (
              <span className="ml-2 text-error-text">{t("topicPage.cancelled")}</span>
            )}
          </p>
        </CardBody>
      </Card>
    </Link>
  );
}

function DelegateRow({ item, isMyDelegate }: { item: TopicDelegationItem; isMyDelegate?: boolean }) {
  const { t } = useTranslation("governance");
  const { delegate, weight } = item;

  return (
    <div className="flex items-center justify-between py-3 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={delegate.name} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {delegate.name}
            {isMyDelegate && (
              <span className="ml-1.5 text-[10px] text-info-text font-normal">{t("topicPage.yourDelegate")}</span>
            )}
          </p>
        </div>
      </div>
      <span className="text-xs text-text-muted tabular-nums shrink-0">
        {t("topicPage.weightLabel", { weight })}
      </span>
    </div>
  );
}

/** Compact delegation indicator: delegate avatar + "Delegated" label. */
function DelegationBadge({
  status,
  assemblyId,
}: {
  status: TopicDelegationStatus;
  assemblyId: string;
}) {
  const { t } = useTranslation("governance");
  return (
    <Link
      to={`/assembly/${assemblyId}/delegations`}
      className="flex flex-col items-center gap-0.5 shrink-0 group"
      title={status.label}
    >
      <Avatar name={status.delegateName} size="sm" />
      <span className="text-[10px] text-text-tertiary group-hover:text-info-text transition-colors leading-tight">
        {t("topicPage.delegated")}
      </span>
    </Link>
  );
}
