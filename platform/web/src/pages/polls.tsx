import { useState } from "react";
import { useParams } from "react-router";
import { useParticipant } from "../hooks/use-participant.js";
import * as api from "../api/client.js";
import type { Poll, PollResults } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Select, ErrorBox, EmptyState, StatusBadge } from "../components/ui.js";

export function Polls() {
  const { assemblyId } = useParams();
  const [creating, setCreating] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Polls</h1>
        <Button onClick={() => setCreating(true)}>Create Poll</Button>
      </div>

      {creating && (
        <CreatePollForm
          assemblyId={assemblyId!}
          onClose={() => setCreating(false)}
          onCreated={(poll) => {
            setPolls([...polls, poll]);
            setCreating(false);
          }}
        />
      )}

      {polls.length === 0 && !creating ? (
        <EmptyState
          title="No polls yet"
          description="Create a poll to gather participant sentiment on a topic."
        />
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => (
            <PollCard key={poll.id} assemblyId={assemblyId!} poll={poll} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePollForm({
  assemblyId,
  onClose,
  onCreated,
}: {
  assemblyId: string;
  onClose: () => void;
  onCreated: (poll: Poll) => void;
}) {
  const { participantId } = useParticipant();
  const [title, setTitle] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState("yes-no");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !questionText.trim()) return;
    setSubmitting(true);
    setFormError(null);

    const now = Date.now();
    try {
      const poll = await api.createPoll(assemblyId, {
        title: title.trim(),
        topicScope: [],
        questions: [
          {
            text: questionText.trim(),
            questionType: buildQuestionType(questionType),
            topicIds: [],
            tags: [],
          },
        ],
        schedule: now,
        closesAt: now + 86400000 * 7,
        createdBy: participantId ?? "unknown",
      });
      onCreated(poll);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create poll");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">New Poll</h3>
          {formError && <ErrorBox message={formError} />}
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Poll title" autoFocus />
          </div>
          <div>
            <Label>Question</Label>
            <Input value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="What would you like to ask?" />
          </div>
          <div>
            <Label>Question Type</Label>
            <Select value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
              <option value="yes-no">Yes / No</option>
              <option value="likert">Likert Scale (1-5)</option>
              <option value="direction">Direction (Support / Oppose)</option>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !title.trim() || !questionText.trim()}>
              {submitting ? "Creating..." : "Create Poll"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function buildQuestionType(type: string): { type: string; [key: string]: unknown } {
  switch (type) {
    case "likert":
      return { type: "likert", scale: 5, labels: ["Strongly Disagree", "Strongly Agree"] };
    case "direction":
      return { type: "direction" };
    case "yes-no":
    default:
      return { type: "yes-no" };
  }
}

function PollCard({ assemblyId, poll }: { assemblyId: string; poll: Poll }) {
  const { participantId } = useParticipant();
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<PollResults | null>(null);
  const [responding, setResponding] = useState(false);

  const loadResults = async () => {
    try {
      const r = await api.getPollResults(assemblyId, poll.id);
      setResults(r);
      setShowResults(true);
    } catch {
      // ignore
    }
  };

  const submitResponse = async (questionId: string, value: unknown) => {
    if (!participantId) return;
    setResponding(true);
    try {
      await api.submitPollResponse(assemblyId, poll.id, {
        participantId,
        answers: [{ questionId, value }],
      });
      await loadResults();
    } catch {
      // ignore
    } finally {
      setResponding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">{poll.title}</h3>
          <StatusBadge status={poll.status} />
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {poll.questions.map((q) => (
          <div key={q.id} className="bg-gray-50 rounded-md p-3">
            <p className="text-sm text-gray-700 mb-2">{q.text}</p>
            {participantId && (
              <div className="flex gap-2">
                {q.questionType.type === "yes-no" && (
                  <>
                    <Button size="sm" onClick={() => submitResponse(q.id, true)} disabled={responding}>Yes</Button>
                    <Button size="sm" variant="secondary" onClick={() => submitResponse(q.id, false)} disabled={responding}>No</Button>
                  </>
                )}
                {q.questionType.type === "likert" && (
                  <>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <Button key={v} size="sm" variant="secondary" onClick={() => submitResponse(q.id, v)} disabled={responding}>
                        {v}
                      </Button>
                    ))}
                  </>
                )}
                {q.questionType.type === "direction" && (
                  <>
                    <Button size="sm" onClick={() => submitResponse(q.id, "support")} disabled={responding}>Support</Button>
                    <Button size="sm" variant="secondary" onClick={() => submitResponse(q.id, "oppose")} disabled={responding}>Oppose</Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={loadResults}>
          {showResults ? "Refresh Results" : "View Results"}
        </Button>
        {showResults && results && (
          <div className="bg-gray-50 rounded-md p-3">
            <p className="text-sm text-gray-500 mb-1">{results.responseCount} responses</p>
            {results.questionResults.map((qr) => (
              <div key={qr.questionId} className="text-sm">
                {qr.mean !== undefined && <p>Mean: {qr.mean.toFixed(2)}</p>}
                {Object.keys(qr.distribution).length > 0 && (
                  <div className="flex gap-3 mt-1">
                    {Object.entries(qr.distribution).map(([val, count]) => (
                      <span key={val} className="text-gray-600">
                        {val}: <span className="font-medium">{count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
