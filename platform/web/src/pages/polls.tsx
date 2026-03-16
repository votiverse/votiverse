import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { useParticipant } from "../hooks/use-participant.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Poll, PollQuestion, PollResults } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Select, ErrorBox, EmptyState, StatusBadge, Skeleton } from "../components/ui.js";

// ---------------------------------------------------------------------------
// Colors for result bars (consistent with tally bars in event-detail.tsx)
// ---------------------------------------------------------------------------

const RESULT_COLORS = [
  "bg-blue-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

// ---------------------------------------------------------------------------
// Polls page
// ---------------------------------------------------------------------------

export function Polls() {
  const { assemblyId } = useParams();
  const { assembly } = useAssembly(assemblyId);
  const [creating, setCreating] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  const pollsEnabled = assembly?.config.features.polls ?? false;

  useEffect(() => {
    if (!assemblyId) return;
    setLoading(true);
    api.listPolls(assemblyId)
      .then((data) => setPolls(data.polls))
      .catch(() => {/* ignore — falls back to empty list */})
      .finally(() => setLoading(false));
  }, [assemblyId]);

  if (!pollsEnabled && !loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">Surveys</h1>
        <EmptyState
          title="Surveys not enabled"
          description="This group's settings do not include surveys. Surveys are available in groups using the accountability or mixed approach models."
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Surveys</h1>
        {pollsEnabled && <Button onClick={() => setCreating(true)}>New Survey</Button>}
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

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : polls.length === 0 && !creating ? (
        <EmptyState
          title="No surveys yet"
          description="Create a survey to gather member feedback on a topic."
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

// ---------------------------------------------------------------------------
// Question draft type for the create form
// ---------------------------------------------------------------------------

interface QuestionDraft {
  text: string;
  type: string;
  options: string[];
}

function emptyQuestion(): QuestionDraft {
  return { text: "", type: "yes-no", options: ["", ""] };
}

// ---------------------------------------------------------------------------
// Create poll form — supports multiple questions and multiple-choice
// ---------------------------------------------------------------------------

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
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const updateQuestion = (idx: number, update: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...update } : q)));
  };

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateOption = (qIdx: number, oIdx: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const opts = [...q.options];
        opts[oIdx] = value;
        return { ...q, options: opts };
      }),
    );
  };

  const addOption = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, options: [...q.options, ""] } : q)),
    );
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        return { ...q, options: q.options.filter((_, j) => j !== oIdx) };
      }),
    );
  };

  const isValid = () => {
    if (!title.trim()) return false;
    return questions.every((q) => {
      if (!q.text.trim()) return false;
      if (q.type === "multiple-choice") {
        const filled = q.options.filter((o) => o.trim());
        return filled.length >= 2;
      }
      return true;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid()) return;
    setSubmitting(true);
    setFormError(null);

    const now = Date.now();
    try {
      const poll = await api.createPoll(assemblyId, {
        title: title.trim(),
        topicScope: [],
        questions: questions.map((q) => ({
          text: q.text.trim(),
          questionType: buildQuestionType(q.type, q.options),
          topicIds: [],
          tags: [],
        })),
        schedule: now,
        closesAt: now + 86400000 * 7,
        createdBy: participantId ?? "unknown",
      });
      onCreated(poll);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create survey");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-gray-900">New Survey</h3>
          {formError && <ErrorBox message={formError} />}

          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Survey title" autoFocus />
          </div>

          {questions.map((q, qIdx) => (
            <div key={qIdx} className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Question {qIdx + 1}</span>
                {questions.length > 1 && (
                  <button type="button" onClick={() => removeQuestion(qIdx)} className="text-xs text-red-500 hover:text-red-700">
                    Remove
                  </button>
                )}
              </div>

              <div>
                <Input
                  value={q.text}
                  onChange={(e) => updateQuestion(qIdx, { text: e.target.value })}
                  placeholder="What would you like to ask?"
                />
              </div>

              <div>
                <Label>Type</Label>
                <Select
                  value={q.type}
                  onChange={(e) => updateQuestion(qIdx, { type: e.target.value, options: ["", ""] })}
                >
                  <option value="yes-no">Yes / No</option>
                  <option value="likert">Likert Scale (1-5)</option>
                  <option value="direction">Direction (Improved / Same / Worsened)</option>
                  <option value="multiple-choice">Multiple Choice</option>
                </Select>
              </div>

              {q.type === "multiple-choice" && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex gap-2 items-center">
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                        placeholder={`Option ${oIdx + 1}`}
                        className="flex-1"
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeOption(qIdx, oIdx)}
                          className="text-gray-400 hover:text-red-500 text-lg px-1"
                          aria-label="Remove option"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addOption(qIdx)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add option
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addQuestion}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add another question
          </button>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !isValid()}>
              {submitting ? "Creating..." : "Create Survey"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function buildQuestionType(type: string, options: string[]): { type: string; [key: string]: unknown } {
  switch (type) {
    case "likert":
      return { type: "likert", scale: 5, labels: ["Strongly Disagree", "Strongly Agree"] };
    case "direction":
      return { type: "direction" };
    case "multiple-choice":
      return { type: "multiple-choice", options: options.filter((o) => o.trim()) };
    case "yes-no":
    default:
      return { type: "yes-no" };
  }
}

// ---------------------------------------------------------------------------
// Poll card — shows questions, response buttons, and results
// ---------------------------------------------------------------------------

function PollCard({ assemblyId, poll }: { assemblyId: string; poll: Poll }) {
  const { participantId } = useParticipant();
  const [results, setResults] = useState<PollResults | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);

  const isClosed = poll.status === "closed";
  const showButtons = !isClosed && !responded && participantId;

  // Auto-load results for closed polls
  useEffect(() => {
    if (isClosed) {
      loadResults();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosed]);

  const loadResults = useCallback(async () => {
    try {
      const r = await api.getPollResults(assemblyId, poll.id);
      setResults(r);
      setResultsError(null);
    } catch (err: unknown) {
      setResultsError(err instanceof Error ? err.message : "Failed to load results");
    }
  }, [assemblyId, poll.id]);

  const submitResponse = async (questionId: string, value: unknown) => {
    if (!participantId) return;
    setResponding(true);
    setResponseError(null);
    try {
      await api.submitPollResponse(assemblyId, poll.id, {
        participantId,
        answers: [{ questionId, value }],
      });
      setResponded(true);
      await loadResults();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit";
      if (msg.includes("already responded")) {
        setResponded(true);
        await loadResults();
      } else {
        setResponseError(msg);
      }
    } finally {
      setResponding(false);
    }
  };

  const closesIn = poll.closesAt - Date.now();
  const closesLabel = closesIn > 0
    ? `Closes in ${Math.ceil(closesIn / 86400000)}d`
    : undefined;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{poll.title}</h3>
            <span className="text-xs text-gray-400">{poll.questions.length}Q</span>
          </div>
          <div className="flex items-center gap-2">
            {closesLabel && !isClosed && (
              <span className="text-xs text-gray-500">{closesLabel}</span>
            )}
            <StatusBadge status={poll.status} />
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {responseError && <ErrorBox message={responseError} />}
        {resultsError && <ErrorBox message={resultsError} />}

        {poll.questions.map((q) => (
          <div key={q.id} className="bg-gray-50 rounded-md p-3 sm:p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">{q.text}</p>

            {showButtons && (
              <QuestionButtons
                question={q}
                responding={responding}
                onSubmit={(value) => submitResponse(q.id, value)}
              />
            )}

            {responded && !results && (
              <p className="text-sm text-green-600">Response recorded</p>
            )}
          </div>
        ))}

        {/* Results section */}
        {!results && !isClosed && (
          <Button variant="ghost" onClick={loadResults} className="w-full sm:w-auto">
            View Results
          </Button>
        )}

        {results && (
          <ResultsDisplay results={results} questions={poll.questions} />
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Response buttons per question type
// ---------------------------------------------------------------------------

function QuestionButtons({
  question,
  responding,
  onSubmit,
}: {
  question: PollQuestion;
  responding: boolean;
  onSubmit: (value: unknown) => void;
}) {
  const { type } = question.questionType;

  if (type === "yes-no") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={() => onSubmit(true)} disabled={responding} className="flex-1 sm:flex-none">
          Yes
        </Button>
        <Button size="lg" variant="secondary" onClick={() => onSubmit(false)} disabled={responding} className="flex-1 sm:flex-none">
          No
        </Button>
      </div>
    );
  }

  if (type === "likert") {
    const scale = (question.questionType as { scale?: number }).scale ?? 5;
    const labels = (question.questionType as { labels?: string[] }).labels;
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: scale }, (_, i) => i + 1).map((v) => (
            <Button key={v} variant="secondary" onClick={() => onSubmit(v)} disabled={responding} className="flex-1 min-w-[48px] min-h-[48px]">
              {v}
            </Button>
          ))}
        </div>
        {labels && labels.length >= 2 && (
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">{labels[0]}</span>
            <span className="text-xs text-gray-400">{labels[1]}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === "direction") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={() => onSubmit("improved")} disabled={responding} className="flex-1 sm:flex-none">
          Improved
        </Button>
        <Button size="lg" variant="secondary" onClick={() => onSubmit("same")} disabled={responding} className="flex-1 sm:flex-none">
          Same
        </Button>
        <Button size="lg" variant="secondary" onClick={() => onSubmit("worsened")} disabled={responding} className="flex-1 sm:flex-none">
          Worsened
        </Button>
      </div>
    );
  }

  if (type === "multiple-choice") {
    const options = (question.questionType as { options?: string[] }).options ?? [];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            size="lg"
            variant="secondary"
            onClick={() => onSubmit(opt)}
            disabled={responding}
            className="w-full justify-center"
          >
            {opt}
          </Button>
        ))}
      </div>
    );
  }

  return <p className="text-sm text-gray-400 italic">Unsupported question type</p>;
}

// ---------------------------------------------------------------------------
// Results display with distribution bars
// ---------------------------------------------------------------------------

/** Humanize distribution keys for display. */
function humanizeKey(key: string, questionType: string): string {
  if (questionType === "yes-no") {
    if (key === "true") return "Yes";
    if (key === "false") return "No";
  }
  if (questionType === "direction") {
    if (key === "improved") return "Improved";
    if (key === "same") return "Same";
    if (key === "worsened") return "Worsened";
  }
  return key;
}

function ResultsDisplay({
  results,
  questions,
}: {
  results: PollResults;
  questions: PollQuestion[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Results</h4>
        <span className="text-xs text-gray-500">
          {results.responseCount} response{results.responseCount !== 1 ? "s" : ""}
          {results.responseRate > 0 && ` (${(results.responseRate * 100).toFixed(0)}% rate)`}
        </span>
      </div>

      {results.questionResults.map((qr) => {
        const question = questions.find((q) => q.id === qr.questionId);
        const qType = question?.questionType.type ?? "";
        const entries = Object.entries(qr.distribution).sort(([, a], [, b]) => b - a);
        const total = entries.reduce((sum, [, count]) => sum + count, 0);

        return (
          <div key={qr.questionId} className="bg-gray-50 rounded-md p-3 sm:p-4">
            {question && (
              <p className="text-sm text-gray-600 mb-2">{question.text}</p>
            )}

            {entries.length > 0 ? (
              <div className="space-y-2">
                {entries.map(([key, count], idx) => {
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  const color = RESULT_COLORS[idx % RESULT_COLORS.length];
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="text-gray-700">{humanizeKey(key, qType)}</span>
                        <span className="text-gray-500">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No responses yet</p>
            )}

            {qr.mean !== undefined && qr.mean !== null && (
              <p className="text-xs text-gray-500 mt-2">
                Mean: {qr.mean.toFixed(2)}
                {qr.median !== undefined && ` · Median: ${qr.median.toFixed(1)}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
