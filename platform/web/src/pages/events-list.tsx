import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { VotingEvent } from "../api/types.js";
import { Card, CardBody, Button, Input, Label, Spinner, ErrorBox, EmptyState, Badge, StatusBadge } from "../components/ui.js";
import { Countdown } from "../components/countdown.js";
import { deriveEventStatus } from "../lib/status.js";

/** Fetch full event details (status, timeline) for all events in a list. */
function useFullEvents(assemblyId: string | undefined, eventIds: string[]) {
  const [fullEvents, setFullEvents] = useState<Record<string, VotingEvent>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assemblyId || eventIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(eventIds.map((id) => api.getEvent(assemblyId, id).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, VotingEvent> = {};
        for (const evt of results) {
          if (evt) map[evt.id] = evt;
        }
        setFullEvents(map);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assemblyId, eventIds.join(",")]);

  return { fullEvents, loading };
}

export function EventsList() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const { assembly: assemblyData } = useAssembly(assemblyId);
  const timelineConfig = assemblyData?.config.timeline;
  const [creating, setCreating] = useState(false);

  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { data: historyData } = useApi(
    () => participantId ? api.getVotingHistory(assemblyId!, participantId) : Promise.resolve(null),
    [assemblyId, participantId],
  );

  const events = data?.events ?? [];
  const eventIds = useMemo(() => events.map((e) => e.id), [events]);
  const { fullEvents, loading: loadingFull } = useFullEvents(assemblyId, eventIds);

  const STATUS_ORDER: Record<string, number> = { voting: 0, curation: 1, deliberation: 2 };
  const votedIssueIds = useMemo(
    () => new Set(historyData?.history.map((h) => h.issueId) ?? []),
    [historyData],
  );
  const sortedEvents = useMemo(() => {
    const enriched = events.map((e) => fullEvents[e.id] ?? e);
    return enriched.sort((a, b) => {
      const aStatus = a.timeline ? deriveEventStatus(a.timeline, timelineConfig) : "";
      const bStatus = b.timeline ? deriveEventStatus(b.timeline, timelineConfig) : "";
      const aO = STATUS_ORDER[aStatus] ?? 2;
      const bO = STATUS_ORDER[bStatus] ?? 2;
      if (aO !== bO) return aO - bO;
      if (aO === 0) {
        // Within voting: events with pending (un-voted) issues first
        const aIssues = a.issueIds ?? a.issues?.map((i) => i.id) ?? [];
        const bIssues = b.issueIds ?? b.issues?.map((i) => i.id) ?? [];
        const aAllVoted = aIssues.length > 0 && aIssues.every((id) => votedIssueIds.has(id));
        const bAllVoted = bIssues.length > 0 && bIssues.every((id) => votedIssueIds.has(id));
        if (aAllVoted !== bAllVoted) return aAllVoted ? 1 : -1;
        return new Date(a.timeline?.votingEnd ?? 0).getTime() - new Date(b.timeline?.votingEnd ?? 0).getTime();
      }
      if (aO === 1) return new Date(a.timeline?.votingStart ?? 0).getTime() - new Date(b.timeline?.votingStart ?? 0).getTime();
      return new Date(b.timeline?.votingEnd ?? 0).getTime() - new Date(a.timeline?.votingEnd ?? 0).getTime();
    });
  }, [events, fullEvents, votedIssueIds]);

  if (loading || loadingFull) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">{t("eventsList.title")}</h1>
        <Button onClick={() => setCreating(true)}>{t("eventsList.createVote")}</Button>
      </div>

      {creating && (
        <CreateEventForm
          assemblyId={assemblyId!}
          onClose={() => setCreating(false)}
          onCreated={refetch}
        />
      )}

      {sortedEvents.length === 0 ? (
        <EmptyState title={t("eventsList.noVotes")} description={t("eventsList.noVotesDesc")} />
      ) : (
        <div className="space-y-3">
          {sortedEvents.map((evt) => (
            <EventCard key={evt.id} assemblyId={assemblyId!} event={evt} history={historyData ?? null} timelineConfig={timelineConfig} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ assemblyId, event: evt, history, timelineConfig }: { assemblyId: string; event: VotingEvent; history: { history: Array<{ issueId: string }> } | null; timelineConfig?: { deliberationDays: number; curationDays: number; votingDays: number } }) {
  const { t } = useTranslation("governance");
  const status = evt.timeline ? deriveEventStatus(evt.timeline, timelineConfig) : undefined;
  const issueIds = evt.issueIds ?? evt.issues?.map((i) => i.id) ?? [];
  const issueCount = issueIds.length;
  const votedCount = history
    ? issueIds.filter((id) => history.history.some((h) => h.issueId === id)).length
    : null;
  const votingEnd = evt.timeline?.votingEnd;

  return (
    <Link to={`/assembly/${assemblyId}/events/${evt.id}`} className="block">
      <Card className="hover:border-accent-muted hover:shadow active:border-accent transition-all">
        <CardBody>
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-text-primary">{evt.title}</h3>
                {status && <StatusBadge status={status} />}
              </div>
              {evt.description && (
                <p className="text-sm text-text-muted mt-0.5 line-clamp-1">{evt.description}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-2">
                <Badge color="gray">{t("eventsList.question", { count: issueCount })}</Badge>
              </div>
              {votedCount !== null && issueCount > 0 && (status === "voting" || status === "closed") && (
                <span className={`text-[10px] font-medium ${votedCount === issueCount ? "text-success-text" : votedCount > 0 ? "text-warning-text" : "text-text-tertiary"}`}>
                  {t("eventsList.votedCount", { voted: votedCount, total: issueCount })}
                </span>
              )}
              {status === "voting" && votingEnd && (
                <Countdown target={votingEnd} className="text-[10px]" />
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function CreateEventForm({ assemblyId, onClose, onCreated }: { assemblyId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation("governance");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issues, setIssues] = useState([{ title: "", description: "" }]);
  const [startNow, setStartNow] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 16); // datetime-local format
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId), [assemblyId]);
  const { assembly: assemblyData } = useAssembly(assemblyId);
  const tl = assemblyData?.config.timeline;

  const addIssue = () => setIssues([...issues, { title: "", description: "" }]);
  const updateIssue = (idx: number, field: "title" | "description", value: string) => {
    setIssues(issues.map((issue, i) => (i === idx ? { ...issue, [field]: value } : issue)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || issues.some((i) => !i.title.trim())) return;
    setSubmitting(true);
    setFormError(null);

    const start = startNow ? Date.now() : new Date(startDate).getTime();
    const participants = participantsData?.participants ?? [];

    try {
      await api.createEvent(assemblyId, {
        title: title.trim(),
        description: description.trim(),
        issues: issues.map((i) => ({ title: i.title.trim(), description: i.description.trim(), topicId: null })),
        eligibleParticipantIds: participants.map((p) => p.id),
        startDate: start,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("eventsList.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const totalDays = tl ? tl.deliberationDays + tl.curationDays + tl.votingDays : null;

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-text-primary">{t("eventsList.newVote")}</h3>
          {formError && <ErrorBox message={formError} />}
          <div>
            <Label>{t("eventsList.titleLabel")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("eventsList.titlePlaceholder")} autoFocus />
          </div>
          <div>
            <Label>{t("eventsList.descLabel")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("eventsList.descPlaceholder")} />
          </div>
          <div>
            <Label>{t("eventsList.questionsLabel")}</Label>
            <div className="space-y-3">
              {issues.map((issue, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={issue.title}
                    onChange={(e) => updateIssue(idx, "title", e.target.value)}
                    placeholder={t("eventsList.questionPlaceholder", { n: idx + 1 })}
                    className="flex-1"
                  />
                  <Input
                    value={issue.description}
                    onChange={(e) => updateIssue(idx, "description", e.target.value)}
                    placeholder={t("eventsList.descOptionalPlaceholder")}
                    className="flex-1"
                  />
                </div>
              ))}
              <button type="button" onClick={addIssue} className="text-sm text-accent-text hover:text-accent-text min-h-[44px] sm:min-h-0 flex items-center">
                {t("eventsList.addQuestion")}
              </button>
            </div>
          </div>

          {/* Start time */}
          <div>
            <Label>{t("eventsList.whenToStart")}</Label>
            <div className="flex items-center gap-3 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={startNow} onChange={() => setStartNow(true)} />
                {t("eventsList.now")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={!startNow} onChange={() => setStartNow(false)} />
                {t("eventsList.schedule")}
              </label>
            </div>
            {!startNow && (
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-2 max-w-xs"
              />
            )}
          </div>

          {/* Timeline summary from assembly config */}
          {tl && (
            <div className="text-xs text-text-tertiary space-y-0.5">
              <p>
                {tl.deliberationDays}d {t("assemblyList.deliberation")}
                {tl.curationDays > 0 && <> + {tl.curationDays}d {t("assemblyList.curation")}</>}
                {" "}+ {tl.votingDays}d {t("assemblyList.voting")}
                {totalDays && <> {t("eventsList.timelineTotal", { total: totalDays })}</>}
              </p>
              <p>{t("eventsList.allMembersEligible", { count: participantsData?.participants.length ?? 0 })}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? t("eventsList.creating") : t("eventsList.createVoteBtn")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
