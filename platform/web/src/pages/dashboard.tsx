import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAttention, type PendingVote } from "../hooks/use-attention.js";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Countdown } from "../components/countdown.js";
import { Card, CardBody, Button, Badge, Skeleton } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { presetLabel } from "../lib/presets.js";

interface VoteGroup {
  assemblyId: string;
  assemblyName: string;
  eventId: string;
  eventTitle: string;
  votingEnd: string;
  pendingCount: number;
  questions: PendingVote[];
}

/** Groups flat pending votes by event, preserving sort order. */
function groupByEvent(votes: PendingVote[]): VoteGroup[] {
  const map = new Map<string, VoteGroup>();
  for (const vote of votes) {
    const key = `${vote.assemblyId}:${vote.eventId}`;
    let group = map.get(key);
    if (!group) {
      group = {
        assemblyId: vote.assemblyId,
        assemblyName: vote.assemblyName,
        eventId: vote.eventId,
        eventTitle: vote.eventTitle,
        votingEnd: vote.votingEnd,
        pendingCount: 0,
        questions: [],
      };
      map.set(key, group);
    }
    group.questions.push(vote);
    if (!vote.hasVoted && !vote.isDelegated) group.pendingCount++;
  }
  return Array.from(map.values());
}

export function Dashboard() {
  const { storeUserId, participantName, loading } = useIdentity();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !storeUserId) {
      // Dashboard is the index route at "/", so redirect is always just "/login"
      navigate("/login", { replace: true });
    }
  }, [loading, storeUserId, navigate]);

  if (loading || !storeUserId) {
    return null;
  }

  return <DashboardContent participantName={participantName} />;
}

function DashboardContent({ participantName }: { participantName: string | null }) {
  const { t } = useTranslation("governance");
  const {
    pendingVotes,
    pendingSurveys,
    totalPending,
    totalPendingSurveys,
    assemblySummaries,
    nearestDeadline,
    loading,
  } = useAttention();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-24 w-full mb-6 rounded-lg" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">
          {t("dashboard.greeting", { name: participantName })}
        </h1>
        <p className="text-sm text-text-muted mt-0.5">{t("dashboard.attentionSubtitle")}</p>
      </div>

      {/* Action banner */}
      {(totalPending > 0 || totalPendingSurveys > 0) ? (
        <div className="mb-6 rounded-xl bg-accent-emphasis p-4 sm:p-5 text-text-on-accent">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-lg sm:text-xl font-semibold">
                {totalPending > 0 && <>{t("dashboard.pendingVotes", { count: totalPending })}</>}
                {totalPending > 0 && totalPendingSurveys > 0 && ` ${t("dashboard.and")} `}
                {totalPendingSurveys > 0 && <>{t("dashboard.pendingSurveys", { count: totalPendingSurveys })}</>}
                {" "}{t("dashboard.needsYou", { count: totalPending + totalPendingSurveys })}
              </p>
              {nearestDeadline && (
                <p className="text-text-on-accent/70 text-sm mt-0.5">
                  {t("dashboard.nearestDeadline", { title: nearestDeadline.eventTitle })}{" "}
                  <Countdown target={nearestDeadline.votingEnd} className="text-text-on-accent font-medium" />
                </p>
              )}
            </div>
            {nearestDeadline && (
              <Link
                to={`/assembly/${nearestDeadline.assemblyId}/events/${nearestDeadline.eventId}`}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-surface-raised text-accent-text font-medium rounded-md hover:bg-interactive-hover transition-colors min-h-[44px] shrink-0"
              >
                {t("dashboard.voteNow")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-xl bg-success-subtle border border-success-border p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-success-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-success-text">{t("dashboard.allCaughtUp")}</p>
              <p className="text-sm text-success-text mt-0.5">{t("dashboard.noPendingDesc")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending invitations */}
      <PendingInvitations />

      {/* Pending join requests (awaiting admin approval) */}
      <PendingJoinRequests />

      {/* Active votes — grouped by event, pending-first */}
      {pendingVotes.length > 0 && (() => {
        const groups = groupByEvent(pendingVotes);
        // Sort: events needing action first, then fully-handled
        groups.sort((a, b) => (a.pendingCount > 0 ? 0 : 1) - (b.pendingCount > 0 ? 0 : 1));
        return (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">{t("dashboard.activeVotes")}</h2>
            <div className="space-y-3">
              {groups.map((group) => (
                <Link
                  key={`${group.assemblyId}-${group.eventId}`}
                  to={`/assembly/${group.assemblyId}/events/${group.eventId}`}
                  className="block"
                >
                  <Card className="hover:border-accent-muted hover:shadow transition-all">
                    <CardBody className="py-3">
                      {/* Event header */}
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-medium text-accent-text bg-accent-subtle px-1.5 py-0.5 rounded uppercase tracking-wide">
                              {group.assemblyName}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-text-primary">{group.eventTitle}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <EventGroupBadge group={group} />
                          <span className="text-[10px] text-text-tertiary">
                            <Countdown target={group.votingEnd} className="text-[10px]" />
                          </span>
                        </div>
                      </div>
                      {/* Question list */}
                      <div className="space-y-1 ml-1">
                        {group.questions.map((q) => (
                          <div key={q.issueId} className="flex items-center justify-between gap-2 py-0.5">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-text-tertiary text-xs">•</span>
                              <span className="text-xs text-text-secondary truncate">{q.issueTitle}</span>
                            </div>
                            <VoteStatusChip vote={q} />
                          </div>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Pending surveys */}
      {pendingSurveys.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">{t("dashboard.pendingSurveysSection")}</h2>
          <div className="space-y-3">
            {pendingSurveys.map((survey) => (
              <Link
                key={survey.surveyId}
                to={`/assembly/${survey.assemblyId}/surveys`}
                className="block"
              >
                <Card className="hover:border-accent-muted hover:shadow transition-all">
                  <CardBody className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-medium text-accent-text bg-accent-subtle px-1.5 py-0.5 rounded uppercase tracking-wide">
                            {survey.assemblyName}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-text-primary">{survey.surveyTitle}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">{t("surveys.question", { count: survey.questionCount })}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] font-medium text-neutral-text bg-neutral-subtle px-1.5 py-0.5 rounded">
                          {t("dashboard.surveyOpen")}
                        </span>
                        {survey.closesAt > 0 && (
                          <span className="text-[10px] text-text-tertiary">
                            <Countdown target={new Date(survey.closesAt).toISOString()} className="text-[10px]" />
                          </span>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Assembly cards */}
      {assemblySummaries.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">{t("dashboard.yourGroups")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {assemblySummaries.map(({ assembly, activeEventCount, pendingVoteCount, pendingSurveyCount }) => (
              <Link key={assembly.id} to={`/assembly/${assembly.id}/events`} className="block">
                <Card className="hover:border-accent-muted hover:shadow transition-all h-full">
                  <CardBody>
                    <h3 className="font-medium text-text-primary">{assembly.name}</h3>
                    <p className="text-xs text-text-tertiary mt-0.5">{presetLabel(assembly.config.name, t)}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <Badge color={activeEventCount > 0 ? "blue" : "gray"}>
                        {t("dashboard.activeVote", { count: activeEventCount })}
                      </Badge>
                      {pendingVoteCount > 0 && (
                        <Badge color="red">
                          {t("dashboard.pendingVote", { count: pendingVoteCount })}
                        </Badge>
                      )}
                      {pendingSurveyCount > 0 && (
                        <Badge color="yellow">
                          {t("dashboard.survey", { count: pendingSurveyCount })}
                        </Badge>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {assemblySummaries.length === 0 && pendingVotes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted">{t("dashboard.noGroups")}</p>
          <Link to="/assemblies" className="text-sm text-accent-text hover:text-accent-muted mt-2 inline-block">
            {t("dashboard.browseGroups")}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Badge for an event group: pending, all voted, all delegated, or mix. */
function EventGroupBadge({ group }: { group: VoteGroup }) {
  const { t } = useTranslation("governance");
  if (group.pendingCount > 0) {
    return (
      <span className="text-[10px] font-medium text-warning-text bg-warning-subtle px-1.5 py-0.5 rounded">
        {t("dashboard.votesNeeded", { count: group.pendingCount })}
      </span>
    );
  }
  // All handled — distinguish voted vs delegated
  const votedCount = group.questions.filter((q) => q.hasVoted).length;
  const delegatedCount = group.questions.filter((q) => q.isDelegated).length;
  const checkIcon = (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
  if (delegatedCount === group.questions.length) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-info-text bg-info-subtle px-1.5 py-0.5 rounded">
        {checkIcon} {t("dashboard.allDelegated")}
      </span>
    );
  }
  if (votedCount === group.questions.length) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success-text bg-success-subtle px-1.5 py-0.5 rounded">
        {checkIcon} {t("dashboard.allVoted")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success-text bg-success-subtle px-1.5 py-0.5 rounded">
      {checkIcon} {t("dashboard.allHandled")}
    </span>
  );
}

function VoteStatusChip({ vote }: { vote: { hasVoted: boolean; isDelegated: boolean; delegateTargetName: string | null } }) {
  const { t } = useTranslation("governance");
  if (vote.hasVoted) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success-text bg-success-subtle px-1.5 py-0.5 rounded">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        {t("dashboard.voted")}
      </span>
    );
  }
  if (vote.isDelegated) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-info-text bg-info-subtle px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
        {vote.delegateTargetName && <Avatar name={vote.delegateTargetName} size="xs" className="!w-3.5 !h-3.5" />}
        {vote.delegateTargetName ? t("dashboard.delegatedTo", { name: vote.delegateTargetName }) : t("dashboard.delegated")}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium text-warning-text bg-warning-subtle px-1.5 py-0.5 rounded">
      {t("dashboard.needsYourVote")}
    </span>
  );
}

function PendingJoinRequests() {
  const { t } = useTranslation("governance");
  const { data } = useApi(() => api.listMyJoinRequests(), []);
  const requests = data?.joinRequests ?? [];
  if (requests.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">{t("dashboard.pendingRequests")}</h2>
      <div className="space-y-2">
        {requests.map((req) => (
          <Card key={req.id} className="border-border-default">
            <CardBody className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm text-text-secondary">
                  {t("dashboard.requestToJoin", { name: req.assemblyName ?? "a group" })}
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {t("dashboard.submitted", { date: formatDate(req.createdAt) })}
                </p>
              </div>
              <Badge color="yellow">{t("dashboard.awaitingReview")}</Badge>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PendingInvitations() {
  const { t } = useTranslation("governance");
  const navigate = useNavigate();
  const { data, refetch } = useApi(() => api.listMyInvitations(), []);
  const [processing, setProcessing] = useState<string | null>(null);

  const invitations = data?.invitations ?? [];
  if (invitations.length === 0) return null;

  const handleAccept = async (inv: { id: string; assemblyId: string }) => {
    setProcessing(inv.id);
    try {
      const result = await api.acceptInvitation(inv.id);
      navigate(`/assembly/${result.assemblyId}`);
    } catch {
      setProcessing(null);
    }
  };

  const handleDecline = async (invId: string) => {
    setProcessing(invId);
    try {
      await api.declineInvitation(invId);
      refetch();
    } catch {
      // ignore
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">{t("dashboard.invitations")}</h2>
      <div className="space-y-2">
        {invitations.map((inv) => (
          <Card key={inv.id} className="border-accent-muted">
            <CardBody className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {t("dashboard.invitedToJoin", { name: inv.assemblyName ?? "a group" })}
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {formatDate(inv.createdAt)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDecline(inv.id)}
                  disabled={processing === inv.id}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAccept(inv)}
                  disabled={processing === inv.id}
                >
                  {processing === inv.id ? t("dashboard.joining") : t("dashboard.accept")}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
