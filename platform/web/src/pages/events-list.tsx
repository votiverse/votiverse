import { useState } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";

export function EventsList() {
  const { assemblyId } = useParams();
  const { data, loading, error, refetch } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const [creating, setCreating] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  const events = data?.events ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Voting Events</h1>
        <Button onClick={() => setCreating(true)}>Create Event</Button>
      </div>

      {creating && (
        <CreateEventForm
          assemblyId={assemblyId!}
          onClose={() => setCreating(false)}
          onCreated={refetch}
        />
      )}

      {events.length === 0 ? (
        <EmptyState title="No voting events yet" description="Create an event to start voting on issues." />
      ) : (
        <div className="space-y-3">
          {events.map((evt) => (
            <Link key={evt.id} to={`/assembly/${assemblyId}/events/${evt.id}`} className="block">
              <Card className="hover:border-brand-200 hover:shadow transition-all">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{evt.title}</h3>
                      {evt.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{evt.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color="gray">{evt.issueIds?.length ?? 0} issues</Badge>
                      <span className="text-xs text-gray-400">
                        {new Date(evt.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
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
      setFormError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">New Voting Event</h3>
          {formError && <ErrorBox message={formError} />}
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" autoFocus />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
          </div>
          <div>
            <Label>Issues</Label>
            <div className="space-y-3">
              {issues.map((issue, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={issue.title}
                    onChange={(e) => updateIssue(idx, "title", e.target.value)}
                    placeholder={`Issue ${idx + 1} title`}
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
              <button type="button" onClick={addIssue} className="text-sm text-brand hover:text-brand-light">
                + Add another issue
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            All current members will be eligible. Voting opens immediately for 7 days.
          </p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
