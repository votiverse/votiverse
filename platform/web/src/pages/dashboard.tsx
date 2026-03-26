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
import { FileText, Clock, Building2, CheckCircle2 } from "lucide-react";

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
      navigate("/login", { replace: true });
    }
  }, [loading, storeUserId, navigate]);

  if (loading || !storeUserId) return null;

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
        <div className="mb-8">
          <Skeleton className="h-10 w-56 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-28 w-full mb-8 rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const firstName = participantName?.split(" ")[0] ?? "";

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
      {/* Greeting */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-display text-text-primary tracking-tight">
          {t("dashboard.greeting", { name: firstName })}
        </h1>
        <p className="text-sm sm:text-base text-text-muted mt-1">{t("dashboard.attentionSubtitle")}</p>
      </div>

      {/* Action banner */}
      {(totalPending > 0 || totalPendingSurveys > 0) ? (
        <div className="mb-8 sm:mb-10 relative overflow-hidden bg-accent-emphasis rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
            <div>
              <p className="text-lg sm:text-xl font-bold font-display text-text-on-accent leading-snug">
                {totalPending > 0 && <>{t("dashboard.pendingVotes", { count: totalPending })}</>}
                {totalPending > 0 && totalPendingSurveys > 0 && ` ${t("dashboard.and")} `}
                {totalPendingSurveys > 0 && <>{t("dashboard.pendingSurveys", { count: totalPendingSurveys })}</>}
                {" "}{t("dashboard.needsYou", { count: totalPending + totalPendingSurveys })}
              </p>
              {nearestDeadline && (
                <p className="flex items-center gap-2 text-text-on-accent/80 text-sm mt-2">
                  <Clock size={14} className="shrink-0" />
                  <span>{t("dashboard.nearestDeadline", { title: nearestDeadline.eventTitle })}{" "}<Countdown target={nearestDeadline.votingEnd} className="text-text-on-accent font-bold" /></span>
                </p>
              )}
            </div>
            {nearestDeadline && (
              <Link
                to={`/assembly/${nearestDeadline.assemblyId}/events/${nearestDeadline.eventId}`}
                className="inline-flex items-center justify-center px-6 py-3 bg-surface-raised text-accent-text font-bold rounded-xl hover:bg-interactive-hover active:scale-[0.97] transition-all min-h-[44px] shrink-0 shadow-sm"
              >
                {t("dashboard.voteNow")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-8 sm:mb-10 rounded-2xl bg-success-subtle border border-success-border p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-success-text shrink-0" />
            <div>
              <p className="font-bold text-success-text">{t("dashboard.allCaughtUp")}</p>
              <p className="text-sm text-success-text/80 mt-0.5">{t("dashboard.noPendingDesc")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending invitations */}
      <PendingInvitations />

      {/* Pending join requests */}
      <PendingJoinRequests />

      {/* Active votes — grouped by event */}
      {pendingVotes.length > 0 && (() => {
        const groups = groupByEvent(pendingVotes);
        groups.sort((a, b) => (a.pendingCount > 0 ? 0 : 1) - (b.pendingCount > 0 ? 0 : 1));
        return (
          <div className="mb-8 sm:mb-10">
            <h2 className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3 sm:mb-4">{t("dashboard.activeVotes")}</h2>
            <div className="space-y-4">
              {groups.map((group) => {
                const firstPending = group.questions.find((q) => !q.hasVoted && !q.isDelegated);
                const hash = firstPending ? `#issue-${firstPending.issueId}` : "";
                return (
                <Link
                  key={`${group.assemblyId}-${group.eventId}`}
                  to={`/assembly/${group.assemblyId}/events/${group.eventId}${hash}`}
                  className="block"
                >
                  <Card className="overflow-hidden hover:border-accent-muted transition-all">
                    {/* Event header */}
                    <div className="bg-surface-sunken px-4 sm:px-5 py-3 border-b border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-accent-text uppercase tracking-widest bg-accent-subtle px-2 py-0.5 rounded-md">
                          {group.assemblyName}
                        </span>
                        <p className="text-base font-bold font-display text-text-primary mt-1 truncate">{group.eventTitle}</p>
                      </div>
                      <div className="flex items-center sm:flex-col sm:items-end gap-1.5 shrink-0">
                        <EventGroupBadge group={group} />
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Clock size={12} />
                          <Countdown target={group.votingEnd} className="text-xs" />
                        </span>
                      </div>
                    </div>
                    {/* Issue rows */}
                    <div className="p-1 sm:p-2">
                      {group.questions.map((q, idx) => (
                        <div
                          key={q.issueId}
                          className={`flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl hover:bg-surface-sunken transition-colors ${idx < group.questions.length - 1 ? "border-b border-border-subtle sm:border-0" : ""}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <FileText size={15} className="text-text-tertiary shrink-0" />
                            <span className="text-sm text-text-secondary truncate font-semibold">{q.issueTitle}</span>
                          </div>
                          <VoteStatusChip vote={q} />
                        </div>
                      ))}
                    </div>
                  </Card>
                </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Pending surveys */}
      {pendingSurveys.length > 0 && (
        <div className="mb-8 sm:mb-10">
          <h2 className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3 sm:mb-4">{t("dashboard.pendingSurveysSection")}</h2>
          <div className="space-y-4">
            {pendingSurveys.map((survey) => (
              <Link
                key={survey.surveyId}
                to={`/assembly/${survey.assemblyId}/surveys`}
                className="block"
              >
                <Card className="hover:border-accent-muted transition-all">
                  <CardBody className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-accent-text uppercase tracking-widest bg-accent-subtle px-2 py-0.5 rounded-md">
                        {survey.assemblyName}
                      </span>
                      <p className="text-base font-bold font-display text-text-primary mt-1 truncate">{survey.surveyTitle}</p>
                      <p className="text-sm text-text-muted mt-0.5">{t("surveys.question", { count: survey.questionCount })}</p>
                    </div>
                    <div className="flex items-center sm:flex-col sm:items-end gap-1.5 shrink-0">
                      <Badge color="blue">{t("dashboard.surveyOpen")}</Badge>
                      {survey.closesAt > 0 && (
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Clock size={12} />
                          <Countdown target={new Date(survey.closesAt).toISOString()} className="text-xs" />
                        </span>
                      )}
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
        <div className="mb-8">
          <h2 className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3 sm:mb-4">{t("dashboard.yourGroups")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {assemblySummaries.map(({ assembly, activeEventCount, pendingVoteCount, pendingSurveyCount }) => (
              <Link key={assembly.id} to={`/assembly/${assembly.id}/events`} className="block">
                <Card className="hover:border-accent-muted hover:-translate-y-0.5 transition-all duration-200 h-full">
                  <CardBody className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 bg-surface-sunken border border-border-default rounded-xl flex items-center justify-center text-base font-bold text-text-muted font-display shadow-sm shrink-0">
                        {assembly.name[0]}
                      </div>
                      <Badge color="gray">{presetLabel(assembly.config.name, t)}</Badge>
                    </div>
                    <h3 className="font-bold font-display text-text-primary text-base leading-tight mb-4">
                      {assembly.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border-subtle">
                      <Badge color={activeEventCount > 0 ? "blue" : "gray"}>
                        {t("dashboard.activeVote", { count: activeEventCount })}
                      </Badge>
                      {pendingVoteCount > 0 && (
                        <Badge color="red">{t("dashboard.pendingVote", { count: pendingVoteCount })}</Badge>
                      )}
                      {pendingSurveyCount > 0 && (
                        <Badge color="yellow">{t("dashboard.survey", { count: pendingSurveyCount })}</Badge>
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
    return <Badge color="yellow">{t("dashboard.votesNeeded", { count: group.pendingCount })}</Badge>;
  }
  const votedCount = group.questions.filter((q) => q.hasVoted).length;
  const delegatedCount = group.questions.filter((q) => q.isDelegated).length;
  if (delegatedCount === group.questions.length) {
    return <Badge color="blue"><span className="flex items-center gap-1"><CheckCircle2 size={12} /> {t("dashboard.allDelegated")}</span></Badge>;
  }
  if (votedCount === group.questions.length) {
    return <Badge color="green"><span className="flex items-center gap-1"><CheckCircle2 size={12} /> {t("dashboard.allVoted")}</span></Badge>;
  }
  return <Badge color="green"><span className="flex items-center gap-1"><CheckCircle2 size={12} /> {t("dashboard.allHandled")}</span></Badge>;
}

function VoteStatusChip({ vote }: { vote: { hasVoted: boolean; isDelegated: boolean; delegateTargetName: string | null } }) {
  const { t } = useTranslation("governance");
  if (vote.hasVoted) {
    return <Badge color="green"><span className="flex items-center gap-1"><CheckCircle2 size={12} /> {t("dashboard.voted")}</span></Badge>;
  }
  if (vote.isDelegated) {
    return (
      <Badge color="blue">
        <span className="flex items-center gap-1.5">
          {vote.delegateTargetName && <Avatar name={vote.delegateTargetName} size="xs" className="border-none !w-4 !h-4 text-[8px]" />}
          {t("dashboard.delegated")}
        </span>
      </Badge>
    );
  }
  return <Button size="sm">{t("dashboard.voteNow")}</Button>;
}

function PendingJoinRequests() {
  const { t } = useTranslation("governance");
  const { data } = useApi(() => api.listMyJoinRequests(), []);
  const requests = data?.joinRequests ?? [];
  if (requests.length === 0) return null;

  return (
    <div className="mb-8 sm:mb-10">
      <h2 className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3 sm:mb-4">{t("dashboard.pendingRequests")}</h2>
      <div className="space-y-3">
        {requests.map((req) => (
          <Card key={req.id}>
            <CardBody className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-secondary">
                  {t("dashboard.requestToJoin", { name: req.assemblyName ?? "a group" })}
                </p>
                <p className="text-xs text-text-tertiary mt-1">
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
    <div className="mb-8 sm:mb-10">
      <h2 className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3 sm:mb-4">{t("dashboard.invitations")}</h2>
      <div className="space-y-3">
        {invitations.map((inv) => (
          <Card key={inv.id} className="border-accent-muted bg-accent-subtle">
            <CardBody className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-surface-raised rounded-xl border border-border-default flex items-center justify-center shadow-sm shrink-0">
                  <Building2 size={18} className="text-accent-text" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">
                    {t("dashboard.invitedToJoin", { name: inv.assemblyName ?? "a group" })}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{formatDate(inv.createdAt)}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => handleDecline(inv.id)} disabled={processing === inv.id}>
                  {t("dashboard.decline")}
                </Button>
                <Button size="sm" onClick={() => handleAccept(inv)} disabled={processing === inv.id}>
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
