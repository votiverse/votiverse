import { useState, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { CommunityNote } from "../api/types.js";
import { Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { NoteContent, sortNotesByRelevance } from "../components/community-notes.js";
import { useEntityNames } from "../hooks/use-entity-names.js";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") ?? "all";
  const setFilter = (value: string) => {
    setSearchParams(value === "all" ? {} : { filter: value }, { replace: true });
  };

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
  const entityNames = useEntityNames(assemblyId, allNotes);

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
              entityNames={entityNames}
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

function NoteCard({ note, assemblyId, nameMap, participantId, entityNames, onChanged }: {
  note: CommunityNote;
  assemblyId: string;
  nameMap: Map<string, string>;
  participantId: string | null;
  entityNames?: Map<string, string>;
  onChanged: () => void;
}) {
  const { t } = useTranslation("governance");
  const [withdrawing, setWithdrawing] = useState(false);

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

  return (
    <div className={`bg-surface-raised rounded-lg p-4 sm:p-5 border-l-[3px] shadow-sm ${
      isWithdrawn ? "border-l-border-default border-y border-r border-border-default opacity-60" :
      isVisible ? "border-l-success-text border-y border-r border-border-default" :
      total > 0 ? "border-l-warning-border border-y border-r border-border-default" :
      "border-l-border-strong border-y border-r border-border-default"
    }`}>
      {/* Header: author + target badge + status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={authorName} size="xs" />
          <span className="text-sm font-semibold text-text-primary">{authorName}</span>
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
        </div>
      </div>

      {/* Note text — shown directly, clamped for long notes */}
      {note.content?.markdown ? (
        <p className="text-sm text-text-secondary font-normal leading-relaxed my-3 line-clamp-4">
          <NoteContent text={note.content.markdown} entityNames={entityNames} />
        </p>
      ) : (
        <p className="text-sm text-text-tertiary italic my-3">{t("notesPage.contentNotAvailable")}</p>
      )}

      {/* Footer: stats + context link + author actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>{note.endorsementCount} {t("notes.helpful")}</span>
          {note.disputeCount > 0 && <span>{note.disputeCount} {t("notes.disputed")}</span>}
          {total > 0 && (
            <span className={ratio >= 0.7 ? "text-success-text" : ratio <= 0.3 ? "text-error" : "text-text-tertiary"}>
              ({Math.round(ratio * 100)}%)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={targetLink(assemblyId, note.target)}
            className="text-xs font-medium text-text-tertiary hover:text-text-secondary"
          >
            {t("notesPage.viewInContext")}
          </Link>
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
