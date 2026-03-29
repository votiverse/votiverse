import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, LinkIcon, Check, Plus, Trash2, X, Search, Trophy, Users, Clock } from "lucide-react";
import { useParticipant } from "../hooks/use-participant.js";
import { useAssembly } from "../hooks/use-assembly.js";
import { useAssemblyRole } from "../hooks/use-assembly-role.js";
import { useApi } from "../hooks/use-api.js";
import { signal } from "../hooks/use-mutation-signal.js";
import * as api from "../api/client.js";
import type { ScoringEvent, ScoringCategory, Scorecard, ScoringResult, ScoringEntryResult, Participant } from "../api/types.js";
import { deriveScoringStatus } from "../lib/status.js";
import { effectiveNow } from "../lib/status.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Select, ErrorBox, EmptyState, StatusBadge, Skeleton, Spinner, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";

type ScoringTab = "open" | "closed";

// ---------------------------------------------------------------------------
// Root component — list view
// ---------------------------------------------------------------------------

export function Scoring() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { assembly } = useAssembly(assemblyId);
  const { isAdmin } = useAssemblyRole(assemblyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") === "closed" ? "closed" : "open") as ScoringTab;
  const setTab = (value: ScoringTab) => {
    setSearchParams(value === "open" ? {} : { tab: value }, { replace: true });
  };
  const [showCreate, setShowCreate] = useState(false);
  const [events, setEvents] = useState<ScoringEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const scoringEnabled = assembly?.config.features.scoring ?? false;

  useEffect(() => {
    if (!assemblyId) return;
    setLoading(true);
    api.listScoringEvents(assemblyId)
      .then((data) => setEvents(data.scoringEvents))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assemblyId]);

  const openEvents = useMemo(() =>
    events.filter((e) => deriveScoringStatus(e.timeline.opensAt, e.timeline.closesAt) !== "closed")
      .sort((a, b) => new Date(a.timeline.closesAt).getTime() - new Date(b.timeline.closesAt).getTime()),
    [events],
  );

  const closedEvents = useMemo(() =>
    events.filter((e) => deriveScoringStatus(e.timeline.opensAt, e.timeline.closesAt) === "closed")
      .sort((a, b) => new Date(b.timeline.closesAt).getTime() - new Date(a.timeline.closesAt).getTime()),
    [events],
  );

  const visibleEvents = tab === "open" ? openEvents : closedEvents;

  if (!scoringEnabled && !loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("scoring.title")}</h1>
        <EmptyState title={t("scoring.notEnabled")} description={t("scoring.notEnabledDesc")} />
      </div>
    );
  }

  if (showCreate) {
    return (
      <div className="max-w-3xl mx-auto animate-page-in">
        <button
          onClick={() => setShowCreate(false)}
          className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px] mb-6"
        >
          <ChevronLeft size={16} />
          {t("scoring.backToScores")}
        </button>
        <CreateScoringForm
          assemblyId={assemblyId!}
          onClose={() => setShowCreate(false)}
          onCreated={(event) => {
            setEvents([event, ...events]);
            setShowCreate(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="animate-page-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("scoring.title")}</h1>
            <p className="text-sm text-text-muted mt-1">{t("scoring.subtitle")}</p>
          </div>
          {scoringEnabled && isAdmin && (
            <Button onClick={() => setShowCreate(true)}>{t("scoring.newScoring")}</Button>
          )}
        </div>

        {/* Open / Closed sub-tabs */}
        <div className="flex gap-4 mb-4 border-b border-border-default">
          {([["open", t("scoring.tabOpen")], ["closed", t("scoring.tabClosed")]] as [ScoringTab, string][]).map(([key, label]) => {
            const count = key === "open" ? openEvents.length : closedEvents.length;
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
        ) : visibleEvents.length === 0 ? (
          <EmptyState
            title={tab === "open" ? t("scoring.noOpenEvents") : t("scoring.noClosedEvents")}
            description={tab === "open" ? t("scoring.noOpenEventsDesc") : t("scoring.noClosedEventsDesc")}
          />
        ) : (
          <div className="space-y-3">
            {visibleEvents.map((event) => (
              <ScoringEventCard key={event.id} assemblyId={assemblyId!} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoring event card — shown in the list view
// ---------------------------------------------------------------------------

function ScoringEventCard({ assemblyId, event }: { assemblyId: string; event: ScoringEvent }) {
  const { t } = useTranslation("governance");
  const status = deriveScoringStatus(event.timeline.opensAt, event.timeline.closesAt);
  const isClosed = status === "closed";
  const closesIn = new Date(event.timeline.closesAt).getTime() - effectiveNow();
  const closesLabel = closesIn > 0
    ? t("scoring.closesIn", { days: Math.ceil(closesIn / 86400000) })
    : undefined;
  const eventUrl = `/assembly/${assemblyId}/scoring/${event.id}`;
  const [copied, setCopied] = useState(false);

  const totalDimensions = event.rubric.categories.reduce(
    (acc, cat) => acc + cat.dimensions.length, 0,
  );

  const copyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = `${window.location.origin}${eventUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Link to={eventUrl} className="block">
      <Card className="group cursor-pointer hover:border-accent-border transition-colors">
        <CardBody className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={status} />
              <span className="text-xs font-medium text-text-tertiary">
                {t("scoring.entry", { count: event.entries.length })}
                {" · "}
                {t("scoring.dimension", { count: totalDimensions })}
              </span>
            </div>
            <h3 className="font-bold text-text-primary text-base sm:text-lg leading-tight truncate">
              {event.title}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-text-muted">
              {closesLabel && !isClosed && <span>{closesLabel}</span>}
              {event.panelMemberIds && (
                <>
                  {closesLabel && !isClosed && <span className="text-border-strong">·</span>}
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {t("scoring.evaluator", { count: event.panelMemberIds.length })}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-raised transition-colors"
              title={t("scoring.copyLink")}
            >
              {copied ? <Check size={16} className="text-success-text" /> : <LinkIcon size={16} />}
            </button>
            {isClosed ? (
              <Button variant="secondary" size="sm">{t("scoring.viewResults")}</Button>
            ) : (
              <Button size="sm">{t("scoring.startScoring")}</Button>
            )}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Scoring detail page — mounted at /assembly/:assemblyId/scoring/:scoringEventId
// ---------------------------------------------------------------------------

export function ScoringDetailPage() {
  const { t } = useTranslation("governance");
  const { assemblyId, scoringEventId } = useParams();
  const [event, setEvent] = useState<ScoringEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assemblyId || !scoringEventId) return;
    setLoading(true);
    api.getScoringEvent(assemblyId, scoringEventId)
      .then(setEvent)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assemblyId, scoringEventId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <Spinner />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          to={`/assembly/${assemblyId}/scoring`}
          className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px] mb-6"
        >
          <ChevronLeft size={16} />
          {t("scoring.backToScores")}
        </Link>
        <EmptyState title={t("scoring.notFound")} description={t("scoring.notFoundDesc")} />
      </div>
    );
  }

  const status = deriveScoringStatus(event.timeline.opensAt, event.timeline.closesAt);

  return (
    <div className="max-w-3xl mx-auto animate-page-in">
      {status === "closed" ? (
        <ScoringResults assemblyId={assemblyId!} event={event} />
      ) : (
        <ScoringForm assemblyId={assemblyId!} event={event} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoring form — submit scorecards for an open event
// ---------------------------------------------------------------------------

function ScoringForm({ assemblyId, event }: { assemblyId: string; event: ScoringEvent }) {
  const { t } = useTranslation("governance");
  const { getParticipantId } = useParticipant();
  const participantId = getParticipantId(assemblyId);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [scorecards, setScorecards] = useState<Record<string, Record<string, number>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existingScorecards, setExistingScorecards] = useState<Scorecard[]>([]);
  const [copied, setCopied] = useState(false);

  // Load existing scorecards for this participant
  useEffect(() => {
    if (!assemblyId || !participantId) return;
    api.listScorecards(assemblyId, event.id)
      .then((data) => {
        const mine = data.scorecards.filter((sc) => sc.evaluatorId === participantId);
        setExistingScorecards(mine);
        // Pre-populate scorecard state
        const populated: Record<string, Record<string, number>> = {};
        for (const sc of mine) {
          populated[sc.entryId] = {};
          for (const s of sc.scores) {
            populated[sc.entryId][s.dimensionId] = s.score;
          }
        }
        if (Object.keys(populated).length > 0) setScorecards(populated);
      })
      .catch(() => {
        // secretScores may return 403 — ignore
      });
  }, [assemblyId, event.id, participantId]);

  const activeEntry = event.entries[activeEntryIndex];
  const currentScores = activeEntry ? scorecards[activeEntry.id] ?? {} : {};
  const totalDimensions = event.rubric.categories.reduce(
    (acc, cat) => acc + cat.dimensions.length, 0,
  );
  const scoredDimensionsCount = Object.keys(currentScores).length;
  const isEntryComplete = scoredDimensionsCount === totalDimensions;
  const completedEntries = event.entries.filter(
    (entry) => {
      const s = scorecards[entry.id];
      return s && Object.keys(s).length === totalDimensions;
    },
  ).length;
  const allComplete = completedEntries === event.entries.length;

  const handleScoreSelect = (dimensionId: string, value: number) => {
    if (!activeEntry) return;
    setScorecards((prev) => ({
      ...prev,
      [activeEntry.id]: {
        ...(prev[activeEntry.id] ?? {}),
        [dimensionId]: value,
      },
    }));
  };

  const handleSubmitAll = async () => {
    if (!participantId || !allComplete) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      for (const entry of event.entries) {
        const entryScores = scorecards[entry.id];
        if (!entryScores) continue;
        const scores = Object.entries(entryScores).map(([dimensionId, score]) => ({
          dimensionId,
          score,
        }));
        const existing = existingScorecards.find((sc) => sc.entryId === entry.id);
        if (existing) {
          await api.reviseScorecard(assemblyId, event.id, existing.id, {
            entryId: entry.id,
            scores,
          });
        } else {
          await api.submitScorecard(assemblyId, event.id, {
            entryId: entry.id,
            scores,
          });
        }
      }
      signal("scoring");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : t("scoring.submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    const fullUrl = `${window.location.origin}/assembly/${assemblyId}/scoring/${event.id}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closesIn = new Date(event.timeline.closesAt).getTime() - effectiveNow();
  const closesLabel = closesIn > 0
    ? t("scoring.closesIn", { days: Math.ceil(closesIn / 86400000) })
    : undefined;

  return (
    <div className="space-y-5 pb-24">
      {/* Back navigation */}
      <Link
        to={`/assembly/${assemblyId}/scoring`}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        <ChevronLeft size={16} />
        {t("scoring.backToScores")}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={deriveScoringStatus(event.timeline.opensAt, event.timeline.closesAt)} />
          {closesLabel && (
            <span className="text-xs font-medium text-text-tertiary flex items-center gap-1">
              <Clock size={12} />
              {closesLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight">
            {event.title}
          </h1>
          <button
            type="button"
            onClick={copyLink}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-raised transition-colors shrink-0"
            title={t("scoring.copyLink")}
          >
            {copied ? <Check size={16} className="text-success-text" /> : <LinkIcon size={16} />}
          </button>
        </div>
        {event.description && (
          <p className="text-sm text-text-muted">{event.description}</p>
        )}
      </div>

      {submitError && <ErrorBox message={submitError} />}

      {/* Dual pane: entry selector + rubric form */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Entry list */}
        <div className="lg:w-1/3 shrink-0">
          <div className="lg:sticky lg:top-20 space-y-3">
            <h3 className="text-sm font-bold text-text-secondary">{t("scoring.entriesToScore")}</h3>
            {event.entries.map((entry, idx) => {
              const isSelected = idx === activeEntryIndex;
              const entryScores = scorecards[entry.id];
              const entryComplete = entryScores && Object.keys(entryScores).length === totalDimensions;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActiveEntryIndex(idx)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center gap-3 ${
                    isSelected
                      ? "border-accent bg-accent-subtle"
                      : "border-border-default bg-surface-raised hover:border-border-strong"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-text-tertiary">Entry {idx + 1}</span>
                    <p className="text-sm font-bold text-text-primary truncate">{entry.title}</p>
                  </div>
                  {entryComplete ? (
                    <Badge color="green">{t("scoring.scoredBadge")}</Badge>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-border-strong shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Rubric scoring form */}
        {activeEntry && (
          <div className="flex-1 min-w-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">{activeEntry.title}</h2>
                    {activeEntry.description && (
                      <p className="text-sm text-text-muted mt-1">{activeEntry.description}</p>
                    )}
                  </div>
                  {isEntryComplete && (
                    <Badge color="green">{t("scoring.scoredBadge")}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardBody className="space-y-8">
                {event.rubric.categories.map((category) => (
                  <div key={category.id} className="space-y-4">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-sm font-bold text-text-primary">{category.name}</h3>
                      <span className="text-xs font-medium text-text-tertiary">
                        {t("scoring.weight", { weight: category.weight })}
                      </span>
                    </div>
                    {category.dimensions.map((dim) => {
                      const dimScore = currentScores[dim.id];
                      const range = Array.from(
                        { length: Math.floor((dim.max - dim.min) / dim.step) + 1 },
                        (_, i) => dim.min + i * dim.step,
                      );
                      return (
                        <div key={dim.id} className="bg-surface rounded-xl p-4 border border-border-subtle">
                          <div className="flex justify-between items-start mb-3">
                            <p className="text-sm font-medium text-text-primary">{dim.name}</p>
                            {dimScore !== undefined && (
                              <span className="text-sm font-bold text-accent-text">
                                {t("scoring.scoreDisplay", { score: dimScore, max: dim.max })}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {range.map((val) => (
                              <Button
                                key={val}
                                size="sm"
                                variant={dimScore === val ? "primary" : "secondary"}
                                className="flex-1 min-w-[40px]"
                                onClick={() => handleScoreSelect(dim.id, val)}
                              >
                                {val}
                              </Button>
                            ))}
                          </div>
                          <div className="flex justify-between mt-2">
                            <span className="text-[10px] font-medium text-text-tertiary">{t("scoring.poor")}</span>
                            <span className="text-[10px] font-medium text-text-tertiary">{t("scoring.excellent")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-surface-raised/90 backdrop-blur-xl border-t border-border-default z-40">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm text-text-muted">
            {t("scoring.entriesScored", { scored: completedEntries, total: event.entries.length })}
          </span>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              disabled={activeEntryIndex === 0}
              onClick={() => setActiveEntryIndex(activeEntryIndex - 1)}
            >
              {t("scoring.previousEntry")}
            </Button>
            {activeEntryIndex < event.entries.length - 1 ? (
              <Button onClick={() => setActiveEntryIndex(activeEntryIndex + 1)}>
                {t("scoring.nextEntry")}
              </Button>
            ) : (
              <Button
                disabled={!allComplete || submitting}
                onClick={handleSubmitAll}
              >
                {submitting ? t("scoring.submitting") : t("scoring.submitAll")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoring results — displayed when the event is closed
// ---------------------------------------------------------------------------

function ScoringResults({ assemblyId, event }: { assemblyId: string; event: ScoringEvent }) {
  const { t } = useTranslation("governance");
  const [results, setResults] = useState<ScoringResult | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getScoringResults(assemblyId, event.id)
      .then(setResults)
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("secret")) {
          setResultsError(t("scoring.scoresSecret"));
        } else {
          setResultsError(err instanceof Error ? err.message : t("scoring.resultsError"));
        }
      })
      .finally(() => setLoading(false));
  }, [assemblyId, event.id, t]);

  const copyLink = async () => {
    const fullUrl = `${window.location.origin}/assembly/${assemblyId}/scoring/${event.id}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build lookup from entryId to entry title
  const entryTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of event.entries) map[entry.id] = entry.title;
    return map;
  }, [event.entries]);

  // Build lookup from categoryId to category name
  const categoryNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of event.rubric.categories) map[cat.id] = cat.name;
    return map;
  }, [event.rubric.categories]);

  const sortedEntries = useMemo(() => {
    if (!results) return [];
    return [...results.entries].sort((a, b) => a.rank - b.rank);
  }, [results]);

  return (
    <div className="space-y-6 pb-12">
      {/* Back navigation */}
      <Link
        to={`/assembly/${assemblyId}/scoring`}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        <ChevronLeft size={16} />
        {t("scoring.backToScores")}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge color="gray">{t("scoring.scoringClosed")}</Badge>
          {results && (
            <span className="text-xs font-bold text-text-muted flex items-center gap-1">
              <Users size={12} />
              {t("scoring.evaluator", { count: results.participatingCount })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight">
            {event.title}
          </h1>
          <button
            type="button"
            onClick={copyLink}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-raised transition-colors shrink-0"
            title={t("scoring.copyLink")}
          >
            {copied ? <Check size={16} className="text-success-text" /> : <LinkIcon size={16} />}
          </button>
        </div>
        <p className="text-sm text-text-muted">{t("scoring.rankingDesc")}</p>
        {results && (
          <p className="text-xs text-text-tertiary mt-1">
            {t("scoring.participationRate", { rate: (results.participationRate * 100).toFixed(0) })}
          </p>
        )}
      </div>

      {resultsError && <ErrorBox message={resultsError} />}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="space-y-4">
          {sortedEntries.map((entry) => (
            <RankedEntryCard
              key={entry.entryId}
              entry={entry}
              entryTitle={entryTitleMap[entry.entryId] ?? entry.entryId}
              categoryNameMap={categoryNameMap}
              maxScore={getMaxRubricScore(event.rubric.categories)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranked entry card — shows rank, score, and category breakdown
// ---------------------------------------------------------------------------

const RANK_STYLES: Record<number, string> = {
  1: "bg-amber-100 text-amber-600 border-2 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  2: "bg-slate-100 text-slate-500 border-2 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
  3: "bg-orange-100 text-orange-700 border-2 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700",
};

function RankedEntryCard({
  entry,
  entryTitle,
  categoryNameMap,
  maxScore,
}: {
  entry: ScoringEntryResult;
  entryTitle: string;
  categoryNameMap: Record<string, string>;
  maxScore: number;
}) {
  const { t } = useTranslation("governance");
  const isWinner = entry.rank === 1;
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <Card className={isWinner ? "border-accent ring-1 ring-accent/20 shadow-md" : ""}>
      <CardBody className="p-4 sm:p-6">
        <div className="flex items-start sm:items-center gap-4 sm:gap-6">
          {/* Rank badge */}
          <div className="shrink-0">
            <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-black font-display ${
              RANK_STYLES[entry.rank] ?? "bg-surface-sunken text-text-muted border border-border-default"
            }`}>
              #{entry.rank}
            </div>
          </div>

          {/* Entry info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-text-primary">{entryTitle}</h3>
            {isWinner && (
              <span className="text-[10px] font-bold uppercase text-accent-text flex items-center gap-1 mt-0.5">
                <Trophy size={12} /> {t("scoring.topRanked")}
              </span>
            )}
          </div>

          {/* Score */}
          <div className="shrink-0 text-right">
            <div className="text-2xl sm:text-3xl font-black font-display text-text-primary">
              {entry.finalScore.toFixed(2)}
            </div>
            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mt-1">
              / {maxScore.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Category breakdown toggle */}
        {entry.categories.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex items-center justify-between w-full text-sm cursor-pointer group"
            >
              <span className="font-bold text-text-muted group-hover:text-text-primary transition-colors">
                {t("scoring.categoryBreakdown")}
              </span>
              <ChevronLeft
                size={16}
                className={`text-text-tertiary group-hover:text-text-primary transition-all ${
                  showBreakdown ? "-rotate-90" : "rotate-180"
                }`}
              />
            </button>
            {showBreakdown && (
              <div className="mt-3 space-y-2">
                {entry.categories.map((cat) => (
                  <div key={cat.categoryId} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{categoryNameMap[cat.categoryId] ?? cat.categoryId}</span>
                    <span className="font-bold text-text-primary">{cat.categoryScore.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Compute the max possible score from a rubric (max of all dimensions, weighted). */
function getMaxRubricScore(categories: ScoringCategory[]): number {
  // The final score is a weighted sum of category scores, where each category score
  // is a weighted sum of dimension scores. For simplicity, return the max dimension value
  // (assumes uniform scale like 1-5).
  let maxDim = 5;
  for (const cat of categories) {
    for (const dim of cat.dimensions) {
      if (dim.max > maxDim) maxDim = dim.max;
    }
  }
  return maxDim;
}

// ---------------------------------------------------------------------------
// Create scoring event form
// ---------------------------------------------------------------------------

interface EntryDraft {
  id: string;
  title: string;
  description: string;
}

interface DimensionDraft {
  id: string;
  name: string;
  min: number;
  max: number;
  step: number;
  weight: number;
}

interface CategoryDraft {
  id: string;
  name: string;
  weight: number;
  dimensions: DimensionDraft[];
}

function emptyDimension(): DimensionDraft {
  return { id: crypto.randomUUID(), name: "", min: 1, max: 5, step: 1, weight: 1 };
}

function emptyCategory(): CategoryDraft {
  return { id: crypto.randomUUID(), name: "", weight: 100, dimensions: [emptyDimension()] };
}

function emptyEntry(): EntryDraft {
  return { id: crypto.randomUUID(), title: "", description: "" };
}

function CreateScoringForm({
  assemblyId,
  onClose,
  onCreated,
}: {
  assemblyId: string;
  onClose: () => void;
  onCreated: (event: ScoringEvent) => void;
}) {
  const { t } = useTranslation("governance");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evaluatorType, setEvaluatorType] = useState<"all" | "panel">("all");
  const [panelMembers, setPanelMembers] = useState<Participant[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [entries, setEntries] = useState<EntryDraft[]>([emptyEntry()]);
  const [categories, setCategories] = useState<CategoryDraft[]>([emptyCategory()]);
  const [settings, setSettings] = useState({
    allowRevision: true,
    secretScores: true,
    normalizeScores: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load participants for panel search
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId), [assemblyId]);
  const allParticipants = participantsData?.participants ?? [];

  const filteredParticipants = useMemo(() => {
    if (!memberSearchQuery.trim()) return [];
    return allParticipants.filter(
      (p) =>
        p.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) &&
        !panelMembers.some((pm) => pm.id === p.id),
    );
  }, [allParticipants, memberSearchQuery, panelMembers]);

  // Entry handlers
  const addEntry = () => setEntries([...entries, emptyEntry()]);
  const removeEntry = (id: string) => setEntries(entries.filter((e) => e.id !== id));
  const updateEntry = (id: string, field: keyof EntryDraft, value: string) =>
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));

  // Category handlers
  const addCategory = () => setCategories([...categories, emptyCategory()]);
  const removeCategory = (id: string) => setCategories(categories.filter((c) => c.id !== id));
  const updateCategory = (id: string, field: "name" | "weight", value: string | number) =>
    setCategories(categories.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  // Dimension handlers
  const addDimension = (catId: string) =>
    setCategories(categories.map((c) =>
      c.id === catId ? { ...c, dimensions: [...c.dimensions, emptyDimension()] } : c,
    ));
  const removeDimension = (catId: string, dimId: string) =>
    setCategories(categories.map((c) =>
      c.id === catId ? { ...c, dimensions: c.dimensions.filter((d) => d.id !== dimId) } : c,
    ));
  const updateDimension = (catId: string, dimId: string, field: keyof DimensionDraft, value: string | number) =>
    setCategories(categories.map((c) =>
      c.id === catId
        ? { ...c, dimensions: c.dimensions.map((d) => (d.id === dimId ? { ...d, [field]: value } : d)) }
        : c,
    ));

  const isValid = () => {
    if (!title.trim()) return false;
    if (entries.length === 0 || !entries.every((e) => e.title.trim())) return false;
    if (categories.length === 0) return false;
    if (!categories.every((c) => c.name.trim() && c.dimensions.length > 0 && c.dimensions.every((d) => d.name.trim()))) return false;
    if (evaluatorType === "panel" && panelMembers.length === 0) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid()) return;
    setSubmitting(true);
    setFormError(null);
    const now = Date.now();
    try {
      const event = await api.createScoringEvent(assemblyId, {
        title: title.trim(),
        description: description.trim(),
        entries: entries.map((e) => ({
          title: e.title.trim(),
          description: e.description.trim() || undefined,
        })),
        rubric: {
          categories: categories.map((c) => ({
            name: c.name.trim(),
            weight: c.weight,
            dimensions: c.dimensions.map((d) => ({
              name: d.name.trim(),
              min: d.min,
              max: d.max,
              step: d.step,
              weight: d.weight,
            })),
          })),
        },
        panelMemberIds: evaluatorType === "panel" ? panelMembers.map((p) => p.id) : undefined,
        opensAt: now,
        closesAt: now + 86400000 * 7,
        settings,
      });
      signal("scoring");
      onCreated(event);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("scoring.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight mb-1">
          {t("scoring.createTitle")}
        </h1>
        <p className="text-sm text-text-muted">{t("scoring.createDesc")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && <ErrorBox message={formError} />}

        {/* Section 1: Event Details */}
        <Card>
          <CardHeader>
            <h3 className="text-base font-bold text-text-primary">{t("scoring.eventDetailsTitle")}</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <Label>{t("scoring.titleLabel")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("scoring.titlePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <Label>{t("scoring.descriptionLabel")}</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("scoring.descriptionPlaceholder")}
                className="block w-full rounded-xl border border-border-strong bg-surface-raised px-3 py-2.5 text-base sm:text-sm shadow-sm placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-focus-ring min-h-[80px] resize-none"
              />
            </div>

            {/* Who Scores */}
            <div className="pt-4 border-t border-border-subtle">
              <Label>{t("scoring.whoScores")}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  evaluatorType === "all" ? "border-accent bg-accent-subtle" : "border-border-default"
                }`}>
                  <input
                    type="radio"
                    checked={evaluatorType === "all"}
                    onChange={() => setEvaluatorType("all")}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="text-sm font-bold text-text-primary">{t("scoring.allMembers")}</div>
                    <div className="text-xs font-medium text-text-muted">{t("scoring.allMembersDesc")}</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  evaluatorType === "panel" ? "border-accent bg-accent-subtle" : "border-border-default"
                }`}>
                  <input
                    type="radio"
                    checked={evaluatorType === "panel"}
                    onChange={() => setEvaluatorType("panel")}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="text-sm font-bold text-text-primary">{t("scoring.selectedPanel")}</div>
                    <div className="text-xs font-medium text-text-muted">{t("scoring.selectedPanelDesc")}</div>
                  </div>
                </label>
              </div>

              {/* Panel member picker */}
              {evaluatorType === "panel" && (
                <div className="mt-4 p-4 bg-surface rounded-xl border border-border-subtle">
                  <Label>{t("scoring.panelMembers", { count: panelMembers.length })}</Label>

                  {panelMembers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {panelMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 bg-surface-raised border border-border-default rounded-lg pl-2 pr-1 py-1"
                        >
                          <Avatar name={m.name} size="xs" />
                          <span className="text-xs font-bold text-text-primary">{m.name}</span>
                          <button
                            type="button"
                            onClick={() => setPanelMembers(panelMembers.filter((pm) => pm.id !== m.id))}
                            className="text-text-tertiary hover:text-error p-0.5"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} />
                    <Input
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder={t("scoring.searchMembers")}
                      className="pl-9"
                    />
                    {filteredParticipants.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-surface-raised border border-border-default rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                        {filteredParticipants.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setPanelMembers([...panelMembers, p]);
                              setMemberSearchQuery("");
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-interactive-hover transition-colors"
                          >
                            <Avatar name={p.name} size="sm" />
                            <span className="text-sm font-bold text-text-primary">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Section 2: Entries */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-base font-bold text-text-primary">{t("scoring.entriesTitle")}</h3>
            <Button type="button" size="sm" variant="secondary" onClick={addEntry}>
              <Plus size={16} /> {t("scoring.addEntry")}
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={entry.id} className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-full bg-surface-sunken border border-border-strong flex items-center justify-center shrink-0 mt-2">
                  <span className="text-[10px] font-black text-text-muted">{idx + 1}</span>
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    value={entry.title}
                    onChange={(e) => updateEntry(entry.id, "title", e.target.value)}
                    placeholder={t("scoring.entryNamePlaceholder")}
                  />
                  <Input
                    value={entry.description}
                    onChange={(e) => updateEntry(entry.id, "description", e.target.value)}
                    placeholder={t("scoring.entryDescPlaceholder")}
                    className="text-sm"
                  />
                </div>
                {entries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="text-text-tertiary hover:text-error p-1 mt-2"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Section 3: Rubric Builder */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary">{t("scoring.rubricTitle")}</h3>
            <p className="text-sm font-medium text-text-muted">{t("scoring.rubricDesc")}</p>
          </div>

          {categories.map((cat) => (
            <Card key={cat.id}>
              <CardBody className="space-y-4 relative">
                {categories.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCategory(cat.id)}
                    className="absolute top-4 right-4 text-text-tertiary hover:text-error"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                <div className="flex flex-col sm:flex-row gap-4 pr-10">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-text-tertiary tracking-wider mb-1">
                      {t("scoring.categoryName")}
                    </label>
                    <Input
                      value={cat.name}
                      onChange={(e) => updateCategory(cat.id, "name", e.target.value)}
                      placeholder={t("scoring.categoryNamePlaceholder")}
                    />
                  </div>
                  <div className="w-full sm:w-32 shrink-0">
                    <label className="block text-[10px] font-bold uppercase text-text-tertiary tracking-wider mb-1">
                      {t("scoring.categoryWeight")}
                    </label>
                    <Input
                      type="number"
                      value={cat.weight}
                      onChange={(e) => updateCategory(cat.id, "weight", parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {/* Dimensions */}
                <div className="bg-surface rounded-xl p-4 border border-border-subtle space-y-3">
                  <label className="block text-[10px] font-bold uppercase text-text-tertiary tracking-wider">
                    {t("scoring.dimensionsLabel")}
                  </label>

                  {cat.dimensions.map((dim) => (
                    <div
                      key={dim.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-surface-raised p-3 rounded-lg border border-border-default"
                    >
                      <div className="flex-1 w-full">
                        <Input
                          value={dim.name}
                          onChange={(e) => updateDimension(cat.id, dim.id, "name", e.target.value)}
                          placeholder={t("scoring.dimensionPlaceholder")}
                          className="text-sm font-bold"
                        />
                      </div>
                      <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase text-text-tertiary">{t("scoring.scaleLabel")}</span>
                          <Select
                            value={`${dim.min}-${dim.max}`}
                            onChange={(e) => {
                              const [min, max] = e.target.value.split("-").map(Number);
                              updateDimension(cat.id, dim.id, "min", min);
                              updateDimension(cat.id, dim.id, "max", max);
                            }}
                            className="w-24 text-xs py-1.5 min-h-0"
                          >
                            <option value="1-5">1 to 5</option>
                            <option value="1-10">1 to 10</option>
                            <option value="0-100">0 to 100</option>
                          </Select>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase text-text-tertiary">{t("scoring.weightLabel")}</span>
                          <Input
                            type="number"
                            value={dim.weight}
                            onChange={(e) => updateDimension(cat.id, dim.id, "weight", parseInt(e.target.value) || 1)}
                            className="w-14 text-xs py-1.5 min-h-0 text-center"
                          />
                        </div>
                        {cat.dimensions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDimension(cat.id, dim.id)}
                            className="text-text-tertiary hover:text-error"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addDimension(cat.id)}
                    className="text-xs font-bold text-info-text hover:underline flex items-center gap-1"
                  >
                    <Plus size={14} /> {t("scoring.addDimension")}
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}

          <button
            type="button"
            onClick={addCategory}
            className="w-full py-3 rounded-xl border-2 border-dashed border-border-strong text-sm font-bold text-text-muted hover:text-text-primary hover:border-border-default transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={18} /> {t("scoring.addCategory")}
          </button>
        </div>

        {/* Section 4: Settings */}
        <Card>
          <CardHeader>
            <h3 className="text-base font-bold text-text-primary">{t("scoring.settingsTitle")}</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <ToggleSetting
              label={t("scoring.settingSecretScores")}
              description={t("scoring.settingSecretScoresDesc")}
              checked={settings.secretScores}
              onChange={() => setSettings({ ...settings, secretScores: !settings.secretScores })}
            />
            <ToggleSetting
              label={t("scoring.settingAllowRevision")}
              description={t("scoring.settingAllowRevisionDesc")}
              checked={settings.allowRevision}
              onChange={() => setSettings({ ...settings, allowRevision: !settings.allowRevision })}
            />
            <ToggleSetting
              label={t("scoring.settingNormalize")}
              description={t("scoring.settingNormalizeDesc")}
              badge={t("scoring.settingNormalizeAdvanced")}
              checked={settings.normalizeScores}
              onChange={() => setSettings({ ...settings, normalizeScores: !settings.normalizeScores })}
            />
          </CardBody>
        </Card>

        {/* Sticky submit footer */}
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-surface-raised/90 backdrop-blur-xl border-t border-border-default z-40">
          <div className="max-w-3xl mx-auto flex gap-3 justify-end">
            <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={onClose}>
              {t("common:cancel")}
            </Button>
            <Button type="submit" className="flex-1 sm:flex-none" disabled={submitting || !isValid()}>
              {submitting ? t("scoring.publishing") : t("scoring.publishEvent")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle setting row
// ---------------------------------------------------------------------------

function ToggleSetting({
  label,
  description,
  badge,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  badge?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center justify-between bg-surface p-4 rounded-xl border border-border-subtle cursor-pointer">
      <div className="pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-primary">{label}</span>
          {badge && <Badge color="blue">{badge}</Badge>}
        </div>
        <span className="text-xs font-medium text-text-muted">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.preventDefault();
          onChange();
        }}
        className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 ${
          checked ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <div className={`w-5 h-5 bg-surface-raised rounded-full shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`} />
      </button>
    </label>
  );
}
