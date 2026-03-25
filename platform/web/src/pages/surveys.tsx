import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useParticipant } from "../hooks/use-participant.js";
import { useAssembly } from "../hooks/use-assembly.js";
import * as api from "../api/client.js";
import type { Survey, SurveyQuestion, SurveyResults } from "../api/types.js";
import { deriveSurveyStatus } from "../lib/status.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Select, ErrorBox, EmptyState, StatusBadge, Skeleton } from "../components/ui.js";

type SurveyTab = "open" | "closed";

// ---------------------------------------------------------------------------
// Colors for result bars (consistent with tally bars in event-detail.tsx)
// ---------------------------------------------------------------------------

const RESULT_COLORS = [
  "bg-tally-1",
  "bg-tally-2",
  "bg-tally-3",
  "bg-tally-4",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

// ---------------------------------------------------------------------------
// Surveys page
// ---------------------------------------------------------------------------

export function Surveys() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { assembly } = useAssembly(assemblyId);
  const { getParticipantId } = useParticipant();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const [creating, setCreating] = useState(false);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SurveyTab>("open");

  const surveysEnabled = assembly?.config.features.surveys ?? false;

  useEffect(() => {
    if (!assemblyId) return;
    setLoading(true);
    api.listSurveys(assemblyId, participantId ?? undefined)
      .then((data) => setSurveys(data.surveys))
      .catch(() => {/* ignore — falls back to empty list */})
      .finally(() => setLoading(false));
  }, [assemblyId, participantId]);

  const openSurveys = useMemo(() => {
    const open = surveys.filter((p) => deriveSurveyStatus(p.schedule, p.closesAt) !== "closed");
    // Sort: unanswered first (by closest deadline), then answered
    return open.sort((a, b) => {
      const aResponded = a.hasResponded ? 1 : 0;
      const bResponded = b.hasResponded ? 1 : 0;
      if (aResponded !== bResponded) return aResponded - bResponded;
      // Within same group, closest deadline first
      return a.closesAt - b.closesAt;
    });
  }, [surveys]);
  const closedSurveys = useMemo(() => {
    const closed = surveys.filter((p) => deriveSurveyStatus(p.schedule, p.closesAt) === "closed");
    // Most recently closed first
    return closed.sort((a, b) => b.closesAt - a.closesAt);
  }, [surveys]);
  const visibleSurveys = tab === "open" ? openSurveys : closedSurveys;

  if (!surveysEnabled && !loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("surveys.title")}</h1>
        <EmptyState
          title={t("surveys.notEnabled")}
          description={t("surveys.notEnabledDesc")}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("surveys.title")}</h1>
        {surveysEnabled && <Button onClick={() => setCreating(true)}>{t("surveys.newSurvey")}</Button>}
      </div>

      {/* Open / Closed tabs */}
      <div className="flex gap-1 mb-4 border-b border-border-default">
        {([["open", t("surveys.tabOpen")], ["closed", t("surveys.tabClosed")]] as [SurveyTab, string][]).map(([key, label]) => {
          const count = key === "open" ? openSurveys.length : closedSurveys.length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-accent text-accent-text"
                  : "border-transparent text-text-muted hover:text-text-secondary hover:border-border-strong"
              }`}
            >
              {label}
              {!loading && <span className="ml-1.5 text-xs text-text-tertiary">({count})</span>}
            </button>
          );
        })}
      </div>

      {creating && (
        <CreateSurveyForm
          assemblyId={assemblyId!}
          onClose={() => setCreating(false)}
          onCreated={(survey) => {
            setSurveys([...surveys, survey]);
            setCreating(false);
          }}
        />
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : visibleSurveys.length === 0 && !creating ? (
        <EmptyState
          title={tab === "open" ? t("surveys.noOpenSurveys") : t("surveys.noClosedSurveys")}
          description={tab === "open"
            ? t("surveys.noOpenSurveysDesc")
            : t("surveys.noClosedSurveysDesc")}
        />
      ) : (
        <div className="space-y-4">
          {visibleSurveys.map((survey) => (
            <SurveyCard key={survey.id} assemblyId={assemblyId!} survey={survey} />
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
// Create survey form — supports multiple questions and multiple-choice
// ---------------------------------------------------------------------------

function CreateSurveyForm({
  assemblyId,
  onClose,
  onCreated,
}: {
  assemblyId: string;
  onClose: () => void;
  onCreated: (survey: Survey) => void;
}) {
  const { t } = useTranslation("governance");
  const { getParticipantId } = useParticipant();
  const participantId = getParticipantId(assemblyId);
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
      const survey = await api.createSurvey(assemblyId, {
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
      onCreated(survey);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("surveys.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="font-medium text-text-primary">{t("surveys.newSurveyTitle")}</h3>
          {formError && <ErrorBox message={formError} />}

          <div>
            <Label>{t("surveys.surveyTitleLabel")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("surveys.surveyTitlePlaceholder")} autoFocus />
          </div>

          {questions.map((q, qIdx) => (
            <div key={qIdx} className="bg-surface rounded-xl p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">{t("surveys.questionN", { n: qIdx + 1 })}</span>
                {questions.length > 1 && (
                  <button type="button" onClick={() => removeQuestion(qIdx)} className="text-xs text-error hover:text-error-text">
                    {t("surveys.removeQuestion")}
                  </button>
                )}
              </div>

              <div>
                <Input
                  value={q.text}
                  onChange={(e) => updateQuestion(qIdx, { text: e.target.value })}
                  placeholder={t("surveys.questionPlaceholder")}
                />
              </div>

              <div>
                <Label>{t("surveys.typeLabel")}</Label>
                <Select
                  value={q.type}
                  onChange={(e) => updateQuestion(qIdx, { type: e.target.value, options: ["", ""] })}
                >
                  <option value="yes-no">{t("surveys.typeYesNo")}</option>
                  <option value="likert">{t("surveys.typeLikert")}</option>
                  <option value="direction">{t("surveys.typeDirection")}</option>
                  <option value="multiple-choice">{t("surveys.typeMultipleChoice")}</option>
                </Select>
              </div>

              {q.type === "multiple-choice" && (
                <div className="space-y-2">
                  <Label>{t("surveys.optionsLabel")}</Label>
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex gap-2 items-center">
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                        placeholder={t("surveys.optionPlaceholder", { n: oIdx + 1 })}
                        className="flex-1"
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeOption(qIdx, oIdx)}
                          className="text-text-tertiary hover:text-error text-lg px-1"
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
                    className="text-sm text-info-text hover:text-info-text"
                  >
                    {t("surveys.addOption")}
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addQuestion}
            className="text-sm text-info-text hover:text-info-text font-medium"
          >
            {t("surveys.addQuestion")}
          </button>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
            <Button type="submit" disabled={submitting || !isValid()}>
              {submitting ? t("surveys.creating") : t("surveys.createSurvey")}
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
// Survey card — shows questions, response buttons, and results
// ---------------------------------------------------------------------------

function SurveyCard({ assemblyId, survey }: { assemblyId: string; survey: Survey }) {
  const { t } = useTranslation("governance");
  const { getParticipantId } = useParticipant();
  const participantId = getParticipantId(assemblyId);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState(survey.hasResponded ?? false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown>>({});

  const isClosed = deriveSurveyStatus(survey.schedule, survey.closesAt) === "closed";
  const showButtons = !isClosed && !responded && participantId;
  const allAnswered = survey.questions.every((q) => q.id in selected);

  // Auto-load results for closed surveys or already-responded surveys
  useEffect(() => {
    if (isClosed || responded) {
      loadResults();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosed, responded]);

  const loadResults = useCallback(async () => {
    try {
      const r = await api.getSurveyResults(assemblyId, survey.id);
      setResults(r);
      setResultsError(null);
    } catch (err: unknown) {
      setResultsError(err instanceof Error ? err.message : "Failed to load results");
    }
  }, [assemblyId, survey.id]);

  const selectAnswer = (questionId: string, value: unknown) => {
    setSelected((prev) => ({ ...prev, [questionId]: value }));
    setResults(null);
  };

  const clearAnswers = () => setSelected({});

  const submitAll = async () => {
    if (!participantId || !allAnswered) return;
    setResponding(true);
    setResponseError(null);
    try {
      const answers = survey.questions.map((q) => ({
        questionId: q.id,
        value: selected[q.id],
      }));
      await api.submitSurveyResponse(assemblyId, survey.id, {
        participantId,
        answers,
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

  const closesIn = survey.closesAt - Date.now();
  const closesLabel = closesIn > 0
    ? t("surveys.closesIn", { days: Math.ceil(closesIn / 86400000) })
    : undefined;

  const answeredCount = Object.keys(selected).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-text-primary">{survey.title}</h3>
            <span className="text-xs text-text-tertiary">{t("surveys.question", { count: survey.questions.length })}</span>
          </div>
          <div className="flex items-center gap-2">
            {closesLabel && !isClosed && (
              <span className="text-xs text-text-muted">{closesLabel}</span>
            )}
            <StatusBadge status={deriveSurveyStatus(survey.schedule, survey.closesAt)} />
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {responseError && <ErrorBox message={responseError} />}
        {resultsError && <ErrorBox message={resultsError} />}

        {survey.questions.map((q) => (
          <div key={q.id} className="bg-surface rounded-md p-3 sm:p-4">
            <p className="text-sm font-medium text-text-secondary mb-3">{q.text}</p>

            {showButtons && (
              <QuestionButtons
                question={q}
                responding={responding}
                selectedValue={selected[q.id]}
                onSelect={(value) => selectAnswer(q.id, value)}
              />
            )}

            {responded && !results && (
              <p className="text-sm text-success-text">{t("surveys.responseRecorded")}</p>
            )}
          </div>
        ))}

        {/* Actions row */}
        {!results && !isClosed && (
          <div className="flex items-center gap-3 pt-1">
            {showButtons && answeredCount > 0 ? (
              <>
                <Button onClick={submitAll} disabled={responding || !allAnswered}>
                  {responding ? t("surveys.submitting") : (survey.questions.length > 1 ? t("surveys.submitResponse", { count: survey.questions.length, answered: answeredCount, total: survey.questions.length }) : t("surveys.submitResponse", { count: 1 }))}
                </Button>
                <button
                  type="button"
                  onClick={clearAnswers}
                  disabled={responding}
                  className="text-sm text-text-muted hover:text-text-secondary disabled:opacity-50"
                >
                  {t("surveys.clear")}
                </button>
              </>
            ) : (
              <Button variant="ghost" onClick={loadResults}>
                {t("surveys.viewResults")}
              </Button>
            )}
          </div>
        )}

        {results && (
          <ResultsDisplay results={results} questions={survey.questions} />
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
  selectedValue,
  onSelect,
}: {
  question: SurveyQuestion;
  responding: boolean;
  selectedValue: unknown;
  onSelect: (value: unknown) => void;
}) {
  const { t } = useTranslation("governance");
  const { type } = question.questionType;

  /** Return variant based on whether the value is currently selected. */
  const variant = (value: unknown) =>
    selectedValue === value ? "primary" as const : "secondary" as const;

  if (type === "yes-no") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" variant={variant(true)} onClick={() => onSelect(true)} disabled={responding} className="flex-1 sm:flex-none">
          {t("surveys.yes")}
        </Button>
        <Button size="lg" variant={variant(false)} onClick={() => onSelect(false)} disabled={responding} className="flex-1 sm:flex-none">
          {t("surveys.no")}
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
            <Button key={v} variant={variant(v)} onClick={() => onSelect(v)} disabled={responding} className="flex-1 min-w-[48px] min-h-[48px]">
              {v}
            </Button>
          ))}
        </div>
        {labels && labels.length >= 2 && (
          <div className="flex justify-between mt-1">
            <span className="text-xs text-text-tertiary">{labels[0]}</span>
            <span className="text-xs text-text-tertiary">{labels[1]}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === "direction") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" variant={variant("improved")} onClick={() => onSelect("improved")} disabled={responding} className="flex-1 sm:flex-none">
          {t("surveys.improved")}
        </Button>
        <Button size="lg" variant={variant("same")} onClick={() => onSelect("same")} disabled={responding} className="flex-1 sm:flex-none">
          {t("surveys.same")}
        </Button>
        <Button size="lg" variant={variant("worsened")} onClick={() => onSelect("worsened")} disabled={responding} className="flex-1 sm:flex-none">
          {t("surveys.worsened")}
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
            variant={variant(opt)}
            onClick={() => onSelect(opt)}
            disabled={responding}
            className="w-full justify-center"
          >
            {opt}
          </Button>
        ))}
      </div>
    );
  }

  return <p className="text-sm text-text-tertiary italic">{t("surveys.unsupported")}</p>;
}

// ---------------------------------------------------------------------------
// Results display with distribution bars
// ---------------------------------------------------------------------------

/** Humanize distribution keys for display. */
function humanizeKey(key: string, questionType: string, t: (k: string) => string): string {
  if (questionType === "yes-no") {
    if (key === "true") return t("surveys.yes");
    if (key === "false") return t("surveys.no");
  }
  if (questionType === "direction") {
    if (key === "improved") return t("surveys.improved");
    if (key === "same") return t("surveys.same");
    if (key === "worsened") return t("surveys.worsened");
  }
  return key;
}

function ResultsDisplay({
  results,
  questions,
}: {
  results: SurveyResults;
  questions: SurveyQuestion[];
}) {
  const { t } = useTranslation("governance");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-secondary">{t("surveys.results")}</h4>
        <span className="text-xs text-text-muted">
          {t("surveys.response", { count: results.responseCount })}
          {results.responseRate > 0 && ` ${t("surveys.responseRate", { rate: (results.responseRate * 100).toFixed(0) })}`}
        </span>
      </div>

      {results.questionResults.map((qr) => {
        const question = questions.find((q) => q.id === qr.questionId);
        const qType = question?.questionType.type ?? "";
        const entries = Object.entries(qr.distribution).sort(([, a], [, b]) => b - a);
        const total = entries.reduce((sum, [, count]) => sum + count, 0);

        return (
          <div key={qr.questionId} className="bg-surface rounded-md p-3 sm:p-4">
            {question && (
              <p className="text-sm text-text-secondary mb-2">{question.text}</p>
            )}

            {entries.length > 0 ? (
              <div className="space-y-2">
                {entries.map(([key, count], idx) => {
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  const color = RESULT_COLORS[idx % RESULT_COLORS.length];
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="text-text-secondary">{humanizeKey(key, qType, t)}</span>
                        <span className="text-text-muted">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2.5 bg-skeleton rounded-full overflow-hidden">
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
              <p className="text-sm text-text-tertiary italic">{t("surveys.noResponses")}</p>
            )}

            {qr.mean !== undefined && qr.mean !== null && (
              <p className="text-xs text-text-muted mt-2">
                {t("surveys.mean", { mean: qr.mean.toFixed(2) })}
                {qr.median !== undefined && ` · ${t("surveys.median", { median: qr.median.toFixed(1) })}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
