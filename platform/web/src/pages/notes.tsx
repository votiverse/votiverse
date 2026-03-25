import { useState, useMemo } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { CommunityNote } from "../api/types.js";
import { Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { NoteContent, sortNotesByRelevance } from "../components/community-notes.js";
import { Avatar } from "../components/avatar.js";



type TFn = (key: string) => string;

function targetTypeLabel(type: string, t: TFn): string {
  const map: Record<string, string> = {
    proposal: t("notesPage.targetProposal"),
    candidacy: t("notesPage.targetCandidate"),
    survey: t("notesPage.targetSurvey"),
    "community-note": t("notesPage.targetNote"),
  };
  return map[type] ?? type;
}

/** Build a link to the page where this note's target lives. */
function targetLink(assemblyId: string, target: CommunityNote["target"]): string {
  switch (target.type) {
    case "proposal":
      return `/assembly/${assemblyId}/proposals`;
    case "candidacy":
      return `/assembly/${assemblyId}/candidacies`;
    case "survey":
      return `/assembly/${assemblyId}/surveys`;
    default:
      return `/assembly/${assemblyId}/notes`;
  }
}

export function Notes() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const [filter, setFilter] = useState<string>("all");

  const { data, loading, error, refetch } = useApi(
    () => api.listNotes(assemblyId!),
    [assemblyId],
  );
  const { data: participantsData } = useApi(
    () => api.listParticipants(assemblyId!),
    [assemblyId],
  );

  const nameMap = useMemo(
    () => new Map((participantsData?.participants ?? []).map((p) => [p.id, p.name])),
    [participantsData],
  );

  const allNotes = data?.notes ?? [];

  // Count my notes
  const myNoteCount = useMemo(
    () => allNotes.filter((n) => n.authorId === participantId).length,
    [allNotes, participantId],
  );

  // Filter
  const filteredNotes = useMemo(() => {
    if (filter === "all") return allNotes;
    if (filter === "mine") return allNotes.filter((n) => n.authorId === participantId);
    return allNotes.filter((n) => n.target.type === filter);
  }, [allNotes, filter, participantId]);

  const sortedNotes = useMemo(() => sortNotesByRelevance(filteredNotes), [filteredNotes]);

  // Count by type for filter badges
  const countByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of allNotes) {
      counts[note.target.type] = (counts[note.target.type] ?? 0) + 1;
    }
    return counts;
  }, [allNotes]);

  const targetTypes = Object.keys(countByType).sort();

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("notesPage.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {t("notesPage.subtitle")}
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip label={t("notesPage.filterAll")} count={allNotes.length} active={filter === "all"} onClick={() => setFilter("all")} />
        {participantId && myNoteCount > 0 && (
          <FilterChip label={t("notesPage.filterMine")} count={myNoteCount} active={filter === "mine"} onClick={() => setFilter("mine")} />
        )}
        {targetTypes.map((type) => (
          <FilterChip
            key={type}
            label={targetTypeLabel(type, t)}
            count={countByType[type] ?? 0}
            active={filter === type}
            onClick={() => setFilter(type)}
          />
        ))}
      </div>

      {sortedNotes.length === 0 ? (
        <EmptyState
          title={filter === "mine" ? t("notesPage.noMineNotes") : t("notesPage.noNotes")}
          description={t("notesPage.noNotesDesc")}
        />
      ) : (
        <div className="space-y-3">
          {sortedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              assemblyId={assemblyId!}
              nameMap={nameMap}
              participantId={participantId}
              onChanged={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-accent text-text-on-accent border-accent"
          : "bg-surface-raised text-text-secondary border-border-default hover:border-border-strong"
      }`}
    >
      {label} ({count})
    </button>
  );
}

function NoteCard({ note, assemblyId, nameMap, participantId, onChanged }: {
  note: CommunityNote;
  assemblyId: string;
  nameMap: Map<string, string>;
  participantId: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation("governance");
  const [expanded, setExpanded] = useState(false);
  const [fullNote, setFullNote] = useState<CommunityNote | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (!fullNote && !note.content?.markdown) {
      setLoadingContent(true);
      try {
        const full = await api.getNote(assemblyId, note.id);
        setFullNote(full);
      } catch {
        // Content unavailable
      } finally {
        setLoadingContent(false);
      }
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      await api.withdrawNote(assemblyId, note.id);
      onChanged();
    } catch {
      // Already withdrawn or not author
    } finally {
      setWithdrawing(false);
    }
  };

  const authorName = nameMap.get(note.authorId) ?? "Unknown";
  const targetLabel = targetTypeLabel(note.target.type, t);
  const total = note.endorsementCount + note.disputeCount;
  const ratio = total > 0 ? note.endorsementCount / total : 0;
  const isVisible = note.visibility?.visible;
  const isWithdrawn = note.status === "withdrawn";
  const isOwnNote = note.authorId === participantId;
  const markdown = note.content?.markdown ?? fullNote?.content?.markdown;

  const accentClass = isWithdrawn ? "border-l-border-default bg-surface/50 opacity-60"
    : isVisible ? "border-l-success bg-success-subtle"
    : total > 0 ? "border-l-warning bg-warning-subtle"
    : "border-l-border-default bg-surface";

  return (
    <div className={`border-l-[3px] rounded-lg border border-border-default bg-surface-raised pl-4 pr-4 py-3 ${accentClass}`}>
        {/* Header: author + linked target + metadata */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={authorName} size="xs" />
            <span className="text-sm font-medium text-text-primary">{authorName}</span>
            <span className="text-xs text-text-tertiary">{t("notesPage.on")}</span>
            <Link to={targetLink(assemblyId, note.target)} className="hover:opacity-80 transition-opacity">
              <Badge color="gray">{targetLabel}</Badge>
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isVisible && <Badge color="green">{t("notes.visible")}</Badge>}
            {isWithdrawn && <Badge color="gray">{t("notes.withdrawn")}</Badge>}
            {note.visibility?.belowMinEvaluations && !isWithdrawn && (
              <Badge color="yellow">{t("notesPage.needsReviews")}</Badge>
            )}
            <span className="text-[10px] text-text-tertiary">
              {formatDate(note.createdAt)}
            </span>
          </div>
        </div>

        {/* Expandable content */}
        {expanded && (
          <div className="mt-2">
            {loadingContent && <p className="text-sm text-text-tertiary">{t("notesPage.loading")}</p>}
            {markdown ? (
              <p className="text-sm text-text-secondary"><NoteContent text={markdown} /></p>
            ) : !loadingContent ? (
              <p className="text-sm text-text-tertiary italic">{t("notesPage.contentNotAvailable")}</p>
            ) : null}
          </div>
        )}

        {/* Footer: read toggle + stats + author actions */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <button onClick={handleExpand} className="text-xs text-text-muted hover:text-text-secondary">
              {expanded ? t("notesPage.collapse") : t("notesPage.read")}
            </button>
            <span className="text-border-default">|</span>
            <span>{t("notesPage.nHelpful", { count: note.endorsementCount })}</span>
            <span>{t("notesPage.nNotHelpful", { count: note.disputeCount })}</span>
            {total > 0 && (
              <span className={ratio >= 0.7 ? "text-success-text" : ratio <= 0.3 ? "text-error" : ""}>
                {t("notesPage.helpfulPercent", { percent: Math.round(ratio * 100) })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Link to context page */}
            <Link
              to={targetLink(assemblyId, note.target)}
              className="text-xs text-text-tertiary hover:text-text-secondary"
            >
              {t("notesPage.viewInContext")}
            </Link>
            {/* Author can withdraw their own note */}
            {isOwnNote && !isWithdrawn && (
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="text-xs text-error hover:text-error-text disabled:opacity-50"
              >
                {withdrawing ? t("notesPage.withdrawing") : t("notesPage.withdraw")}
              </button>
            )}
          </div>
        </div>
    </div>
  );
}
