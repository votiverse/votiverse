import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { useParticipant } from "../hooks/use-participant.js";
import { useAssembly } from "../hooks/use-assembly.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import type { Survey, SurveyQuestion, SurveyResults } from "../api/types.js";
import { deriveSurveyStatus } from "../lib/status.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Select, ErrorBox, EmptyState, StatusBadge, Skeleton } from "../components/ui.js";

type SurveyTab = "todo" | "results";
type ViewState =
  | { level: "list" }
  | { level: "detail"; surveyId: string }
  | { level: "create" };

// ---------------------------------------------------------------------------
// Colors for result bars
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
// Root component — state machine
// ---------------------------------------------------------------------------

export function Surveys() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { assembly } = useAssembly(assemblyId);
  const { getParticipantId } = useParticipant();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SurveyTab>("todo");
  const [view, setView] = useState<ViewState>({ level: "list" });

  const surveysEnabled = assembly?.config.features.surveys ?? false;

  useEffect(() => {
    if (!assemblyId) return;
    setLoading(true);
    api.listSurveys(assemblyId, participantId ?? undefined)
      .then((data) => setSurveys(data.surveys))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assemblyId, participantId]);

  // To Do: open surveys the user hasn't responded to, sorted by closest deadline
  const todoSurveys = useMemo(() => {
    return surveys
      .filter((s) => deriveSurveyStatus(s.schedule, s.closesAt) !== "closed" && !s.hasResponded)
      .sort((a, b) => a.closesAt - b.closesAt);
  }, [surveys]);

  // Results: surveys the user has responded to (open or closed) + closed surveys they skipped
  const resultsSurveys = useMemo(() => {
    return surveys
      .filter((s) => s.hasResponded || deriveSurveyStatus(s.schedule, s.closesAt) === "closed")
      .sort((a, b) => b.closesAt - a.closesAt);
  }, [surveys]);

  const visibleSurveys = tab === "todo" ? todoSurveys : resultsSurveys;
  const activeSurvey = view.level === "detail" ? surveys.find((s) => s.id === view.surveyId) : null;

  if (!surveysEnabled && !loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("surveys.title")}</h1>
        <EmptyState title={t("surveys.notEnabled")} description={t("surveys.notEnabledDesc")} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto" key={view.level}>
      {/* LEVEL 1: Survey list */}
      {view.level === "list" && (
        <div className="animate-page-in">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("surveys.title")}</h1>
              <p className="text-sm text-text-muted mt-1">{t("surveys.subtitle")}</p>
            </div>
            {surveysEnabled && (
              <Button onClick={() => setView({ level: "create" })}>{t("surveys.newSurvey")}</Button>
            )}
          </div>

          {/* To Do / Results sub-tabs */}
          <div className="flex gap-4 mb-4 border-b border-border-default">
            {([["todo", t("surveys.tabTodo")], ["results", t("surveys.tabResults")]] as [SurveyTab, string][]).map(([key, label]) => {
              const count = key === "todo" ? todoSurveys.length : resultsSurveys.length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`pb-3 text-sm font-bold border-b-2 -mb-px transition-colors min-h-[44px] ${
                    tab === key
                      ? "border-accent text-accent-text"
                      : "border-transparent text-text-muted hover:text-text-primary hover:border-border-strong"
                  }`}
                >
                  {label}
                  {!loading && <span className="ml-1.5 text-xs text-text-tertiary">({count})</span>}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : visibleSurveys.length === 0 ? (
            <EmptyState
              title={tab === "todo" ? t("surveys.noTodoSurveys") : t("surveys.noResultsSurveys")}
              description={tab === "todo" ? t("surveys.noTodoSurveysDesc") : t("surveys.noResultsSurveysDesc")}
            />
          ) : (
            <div className="space-y-3">
              {visibleSurveys.map((survey) => (
                <SurveySummaryCard
                  key={survey.id}
                  survey={survey}
                  onClick={() => setView({ level: "detail", surveyId: survey.id })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* LEVEL 2: Survey detail — take or view results */}
      {view.level === "detail" && activeSurvey && (
        <div className="animate-page-in">
          <SurveyDetail
            assemblyId={assemblyId!}
            survey={activeSurvey}
            onBack={() => setView({ level: "list" })}
            onResponded={() => {
              // Refresh the survey list to reflect hasResponded
              if (assemblyId) {
                api.listSurveys(assemblyId, participantId ?? undefined)
                  .then((data) => setSurveys(data.surveys))
                  .catch(() => {});
              }
            }}
          />
        </div>
      )}

      {/* LEVEL 3: Create survey */}
      {view.level === "create" && (
        <div className="animate-page-in">
          <button
            onClick={() => setView({ level: "list" })}
            className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px] mb-6"
          >
            <ChevronLeft size={16} />
            {t("surveys.backToSurveys")}
          </button>

          <CreateSurveyForm
            assemblyId={assemblyId!}
            onClose={() => setView({ level: "list" })}
            onCreated={(survey) => {
              setSurveys([...surveys, survey]);
              setView({ level: "list" });
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card — shown in the list view
// ---------------------------------------------------------------------------

function SurveySummaryCard({ survey, onClick }: { survey: Survey; onClick: () => void }) {
  const { t } = useTranslation("governance");
  const status = deriveSurveyStatus(survey.schedule, survey.closesAt);
  const isClosed = status === "closed";
  const isOpen = status === "open";
  const closesIn = survey.closesAt - Date.now();
  const closesLabel = closesIn > 0
    ? t("surveys.closesIn", { days: Math.ceil(closesIn / 86400000) })
    : undefined;

  return (
    <Card
      className="group cursor-pointer hover:border-accent-border transition-colors"
      onClick={onClick}
    >
      <CardBody className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {survey.hasResponded && isOpen ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full bg-info-bg text-info-text">
                {t("surveys.stillCollecting")}
              </span>
            ) : (
              <StatusBadge status={status} />
            )}
            <span className="text-xs font-medium text-text-tertiary">
              {t("surveys.question", { count: survey.questions.length })}
            </span>
          </div>
          <h3 className="font-bold text-text-primary text-base sm:text-lg leading-tight truncate">
            {survey.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-sm text-text-muted">
            {closesLabel && !isClosed && <span>{closesLabel}</span>}
            {survey.responseCount !== undefined && survey.responseCount > 0 && (
              <>
                {closesLabel && !isClosed && <span className="text-border-strong">·</span>}
                <span>{t("surveys.response", { count: survey.responseCount })}</span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {isClosed || survey.hasResponded ? (
            <Button variant="secondary" size="sm">{t("surveys.viewResults")}</Button>
          ) : (
            <Button size="sm">{t("surveys.takeSurvey")}</Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Survey detail — full survey with questions, responses, and results
// ---------------------------------------------------------------------------

function SurveyDetail({
  assemblyId,
  survey,
  onBack,
  onResponded,
}: {
  assemblyId: string;
  survey: Survey;
  onBack: () => void;
  onResponded: () => void;
}) {
  const { t } = useTranslation("governance");
  const { getParticipantId } = useParticipant();
  const participantId = getParticipantId(assemblyId);
  const attention = useAttention();
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState(survey.hasResponded ?? false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown>>({});

  const isClosed = deriveSurveyStatus(survey.schedule, survey.closesAt) === "closed";
  const showButtons = !isClosed && !responded && participantId;
  const allAnswered = survey.questions.every((q) => q.id in selected);
  const answeredCount = Object.keys(selected).length;
  const closesIn = survey.closesAt - Date.now();
  const closesLabel = closesIn > 0
    ? t("surveys.closesIn", { days: Math.ceil(closesIn / 86400000) })
    : undefined;

  // Auto-load results for closed or responded surveys
  useEffect(() => {
    if (isClosed || responded) loadResults();
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
      await api.submitSurveyResponse(assemblyId, survey.id, { participantId, answers });
      setResponded(true);
      attention.refresh();
      onResponded();
      await loadResults();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit";
      if (msg.includes("already responded")) {
        setResponded(true);
        attention.refresh();
        onResponded();
        await loadResults();
      } else {
        setResponseError(msg);
      }
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Back navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        <ChevronLeft size={16} />
        {t("surveys.backToSurveys")}
      </button>

      {/* Survey header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={deriveSurveyStatus(survey.schedule, survey.closesAt)} />
          {closesLabel && !isClosed && (
            <span className="text-xs font-medium text-text-tertiary">{closesLabel}</span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight mb-1">
          {survey.title}
        </h1>
        {showButtons && (
          <p className="text-sm text-text-muted">{t("surveys.detailInstructions")}</p>
        )}
        {responded && !results && (
          <p className="text-sm text-success-text">{t("surveys.responseRecorded")}</p>
        )}
      </div>

      {responseError && <ErrorBox message={responseError} />}
      {resultsError && <ErrorBox message={resultsError} />}

      {/* Questions */}
      <div className="space-y-4">
        {survey.questions.map((q, qIdx) => (
          <Card key={q.id}>
            <CardBody className="p-4 sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-7 h-7 rounded-full bg-surface-sunken border border-border-strong flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-text-muted">{qIdx + 1}</span>
                </div>
                <p className="text-sm sm:text-base font-medium text-text-primary pt-0.5">{q.text}</p>
              </div>

              {showButtons && (
                <QuestionButtons
                  question={q}
                  responding={responding}
                  selectedValue={selected[q.id]}
                  onSelect={(value) => selectAnswer(q.id, value)}
                />
              )}

              {/* Per-question results */}
              {results && (
                <QuestionResult
                  questionId={q.id}
                  question={q}
                  results={results}
                />
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Submit action bar */}
      {showButtons && answeredCount > 0 && (
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={submitAll} disabled={responding || !allAnswered}>
            {responding ? t("surveys.submitting") : t("surveys.submitResponse", { count: survey.questions.length, answered: answeredCount, total: survey.questions.length })}
          </Button>
          <button
            type="button"
            onClick={clearAnswers}
            disabled={responding}
            className="text-sm text-text-muted hover:text-text-secondary disabled:opacity-50"
          >
            {t("surveys.clear")}
          </button>
        </div>
      )}

      {/* Results summary */}
      {results && (
        <div className="flex items-center gap-2 text-sm text-text-muted pt-2">
          <span>{t("surveys.response", { count: results.responseCount })}</span>
          {results.responseRate > 0 && (
            <span>· {t("surveys.responseRate", { rate: (results.responseRate * 100).toFixed(0) })}</span>
          )}
        </div>
      )}

      {/* View results button for unanswered open surveys */}
      {!results && !isClosed && !showButtons && (
        <Button variant="ghost" onClick={loadResults}>{t("surveys.viewResults")}</Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question result — per-question distribution bars
// ---------------------------------------------------------------------------

function QuestionResult({
  questionId,
  question,
  results,
}: {
  questionId: string;
  question: SurveyQuestion;
  results: SurveyResults;
}) {
  const { t } = useTranslation("governance");
  const qr = results.questionResults.find((r) => r.questionId === questionId);
  if (!qr) return null;

  const qType = question.questionType.type;
  const entries = Object.entries(qr.distribution).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="mt-4 pt-4 border-t border-border-subtle">
      {entries.length > 0 ? (
        <div className="space-y-2.5">
          {entries.map(([key, count], idx) => {
            const pct = total > 0 ? (count / total) * 100 : 0;
            const color = RESULT_COLORS[idx % RESULT_COLORS.length];
            return (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-text-secondary font-medium">{humanizeKey(key, qType, t)}</span>
                  <span className="text-text-muted">{count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="h-2.5 bg-skeleton rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
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
}

// ---------------------------------------------------------------------------
// Create survey form
// ---------------------------------------------------------------------------

interface QuestionDraft {
  text: string;
  type: string;
  options: string[];
}

function emptyQuestion(): QuestionDraft {
  return { text: "", type: "yes-no", options: ["", ""] };
}

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
  const removeQuestion = (idx: number) => setQuestions((prev) => prev.filter((_, i) => i !== idx));
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
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, options: [...q.options, ""] } : q)));
  };
  const removeOption = (qIdx: number, oIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i !== qIdx ? q : { ...q, options: q.options.filter((_, j) => j !== oIdx) })),
    );
  };

  const isValid = () => {
    if (!title.trim()) return false;
    return questions.every((q) => {
      if (!q.text.trim()) return false;
      if (q.type === "multiple-choice") return q.options.filter((o) => o.trim()).length >= 2;
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
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight mb-1">
          {t("surveys.newSurveyTitle")}
        </h1>
        <p className="text-sm text-text-muted">{t("surveys.newSurveyDesc")}</p>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                <Input value={q.text} onChange={(e) => updateQuestion(qIdx, { text: e.target.value })} placeholder={t("surveys.questionPlaceholder")} />
                <div>
                  <Label>{t("surveys.typeLabel")}</Label>
                  <Select value={q.type} onChange={(e) => updateQuestion(qIdx, { type: e.target.value, options: ["", ""] })}>
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
                        <Input value={opt} onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} placeholder={t("surveys.optionPlaceholder", { n: oIdx + 1 })} className="flex-1" />
                        {q.options.length > 2 && (
                          <button type="button" onClick={() => removeOption(qIdx, oIdx)} className="text-text-tertiary hover:text-error text-lg px-1" aria-label="Remove option">×</button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => addOption(qIdx)} className="text-sm text-info-text hover:text-info-text">{t("surveys.addOption")}</button>
                  </div>
                )}
              </div>
            ))}

            <button type="button" onClick={addQuestion} className="text-sm text-info-text hover:text-info-text font-medium">{t("surveys.addQuestion")}</button>

            <div className="flex gap-2 justify-end pt-4 border-t border-border-subtle">
              <Button type="button" variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
              <Button type="submit" disabled={submitting || !isValid()}>
                {submitting ? t("surveys.creating") : t("surveys.createSurvey")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
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
        <Button size="lg" variant={variant("improved")} onClick={() => onSelect("improved")} disabled={responding} className="flex-1 sm:flex-none">{t("surveys.improved")}</Button>
        <Button size="lg" variant={variant("same")} onClick={() => onSelect("same")} disabled={responding} className="flex-1 sm:flex-none">{t("surveys.same")}</Button>
        <Button size="lg" variant={variant("worsened")} onClick={() => onSelect("worsened")} disabled={responding} className="flex-1 sm:flex-none">{t("surveys.worsened")}</Button>
      </div>
    );
  }

  if (type === "multiple-choice") {
    const options = (question.questionType as { options?: string[] }).options ?? [];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <Button key={opt} size="lg" variant={variant(opt)} onClick={() => onSelect(opt)} disabled={responding} className="w-full justify-center">{opt}</Button>
        ))}
      </div>
    );
  }

  return <p className="text-sm text-text-tertiary italic">{t("surveys.unsupported")}</p>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQuestionType(type: string, options: string[]): { type: string; [key: string]: unknown } {
  switch (type) {
    case "likert": return { type: "likert", scale: 5, labels: ["Strongly Disagree", "Strongly Agree"] };
    case "direction": return { type: "direction" };
    case "multiple-choice": return { type: "multiple-choice", options: options.filter((o) => o.trim()) };
    case "yes-no":
    default: return { type: "yes-no" };
  }
}

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
