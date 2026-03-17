import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
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
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
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

  const STATUS_ORDER: Record<string, number> = { voting: 0, deliberation: 1 };
  const sortedEvents = useMemo(() => {
    const enriched = events.map((e) => fullEvents[e.id] ?? e);
    return enriched.sort((a, b) => {
      const aStatus = a.timeline ? deriveEventStatus(a.timeline) : "";
      const bStatus = b.timeline ? deriveEventStatus(b.timeline) : "";
      const aO = STATUS_ORDER[aStatus] ?? 2;
      const bO = STATUS_ORDER[bStatus] ?? 2;
      if (aO !== bO) return aO - bO;
      if (aO === 0) return new Date(a.timeline?.votingEnd ?? 0).getTime() - new Date(b.timeline?.votingEnd ?? 0).getTime();
      if (aO === 1) return new Date(a.timeline?.votingStart ?? 0).getTime() - new Date(b.timeline?.votingStart ?? 0).getTime();
      return new Date(b.timeline?.votingEnd ?? 0).getTime() - new Date(a.timeline?.votingEnd ?? 0).getTime();
    });
  }, [events, fullEvents]);

  if (loading || loadingFull) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Votes</h1>
        <Button onClick={() => setCreating(true)}>Create a Vote</Button>
      </div>

      {creating && (
        <CreateEventForm
          assemblyId={assemblyId!}
          onClose={() => setCreating(false)}
          onCreated={refetch}
        />
      )}

      {sortedEvents.length === 0 ? (
        <EmptyState title="No votes yet" description="Create a vote to start making decisions." />
      ) : (
        <div className="space-y-3">
          {sortedEvents.map((evt) => (
            <EventCard key={evt.id} assemblyId={assemblyId!} event={evt} history={historyData ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ assemblyId, event: evt, history }: { assemblyId: string; event: VotingEvent; history: { history: Array<{ issueId: string }> } | null }) {
  const status = evt.timeline ? deriveEventStatus(evt.timeline) : undefined;
  const issueIds = evt.issueIds ?? evt.issues?.map((i) => i.id) ?? [];
  const issueCount = issueIds.length;
  const votedCount = history
    ? issueIds.filter((id) => history.history.some((h) => h.issueId === id)).length
    : null;
  const votingEnd = evt.timeline?.votingEnd;

  return (
    <Link to={`/assembly/${assemblyId}/events/${evt.id}`} className="block">
      <Card className="hover:border-brand-200 hover:shadow active:border-brand transition-all">
        <CardBody>
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-gray-900">{evt.title}</h3>
                {status && <StatusBadge status={status} />}
              </div>
              {evt.description && (
                <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{evt.description}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-2">
                <Badge color="gray">{issueCount} question{issueCount !== 1 ? "s" : ""}</Badge>
              </div>
              {votedCount !== null && issueCount > 0 && status === "voting" && (
                <span className={`text-[10px] font-medium ${votedCount === issueCount ? "text-green-600" : "text-amber-600"}`}>
                  Voted {votedCount}/{issueCount}
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issues, setIssues] = useState([{ title: "", description: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId), [assemblyId]);

  const addIssue = () => setIssues([...issues, { title: "", description: "" }]);
  const updateIssue = (idx: number, field: "title" | "description", value: string) => {
    setIssues(issues.map((issue, i) => (i === idx ? { ...issue, [field]: value } : issue)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || issues.some((i) => !i.title.trim())) return;
    setSubmitting(true);
    setFormError(null);

    const now = Date.now();
    const participants = participantsData?.participants ?? [];

    try {
      await api.createEvent(assemblyId, {
        title: title.trim(),
        description: description.trim(),
        issues: issues.map((i) => ({ title: i.title.trim(), description: i.description.trim(), topicIds: [] })),
        eligibleParticipantIds: participants.map((p) => p.id),
        timeline: {
          deliberationStart: new Date(now - 86400000).toISOString(),
          votingStart: new Date(now).toISOString(),
          votingEnd: new Date(now + 86400000 * 7).toISOString(),
        },
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create vote");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">New Vote</h3>
          {formError && <ErrorBox message={formError} />}
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vote title" autoFocus />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
          </div>
          <div>
            <Label>Questions</Label>
            <div className="space-y-3">
              {issues.map((issue, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={issue.title}
                    onChange={(e) => updateIssue(idx, "title", e.target.value)}
                    placeholder={`Question ${idx + 1}`}
                    className="flex-1"
                  />
                  <Input
                    value={issue.description}
                    onChange={(e) => updateIssue(idx, "description", e.target.value)}
                    placeholder="Description (optional)"
                    className="flex-1"
                  />
                </div>
              ))}
              <button type="button" onClick={addIssue} className="text-sm text-brand hover:text-brand-light min-h-[44px] sm:min-h-0 flex items-center">
                + Add another question
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            All current members will be eligible. Voting opens immediately for 7 days.
          </p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "Creating..." : "Create Vote"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
