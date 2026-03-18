import { useState, useMemo } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { CommunityNote } from "../api/types.js";
import { Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { NoteContent } from "../components/community-notes.js";
import { Avatar } from "../components/avatar.js";

const TARGET_TYPE_LABELS: Record<string, string> = {
  proposal: "Proposal",
  candidacy: "Candidate",
  survey: "Survey",
  "community-note": "Note",
};

/** Build a link to the page where this note's target lives. */
function targetLink(assemblyId: string, target: CommunityNote["target"]): string {
  switch (target.type) {
    case "proposal":
      return `/assembly/${assemblyId}/proposals`;
    case "candidacy":
      return `/assembly/${assemblyId}/candidacies`;
    case "survey":
      return `/assembly/${assemblyId}/polls`;
    default:
      return `/assembly/${assemblyId}/notes`;
  }
}

export function Notes() {
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

  // Sort: most recent first, visible above non-visible
  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      const aVis = a.visibility?.visible ? 0 : 1;
      const bVis = b.visibility?.visible ? 0 : 1;
      if (aVis !== bVis) return aVis - bVis;
      return b.createdAt - a.createdAt;
    });
  }, [filteredNotes]);

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
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Notes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Community notes add context, evidence, or corrections to proposals and candidates.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip label="All" count={allNotes.length} active={filter === "all"} onClick={() => setFilter("all")} />
        {participantId && myNoteCount > 0 && (
          <FilterChip label="Mine" count={myNoteCount} active={filter === "mine"} onClick={() => setFilter("mine")} />
        )}
        {targetTypes.map((type) => (
          <FilterChip
            key={type}
            label={TARGET_TYPE_LABELS[type] ?? type}
            count={countByType[type] ?? 0}
            active={filter === type}
            onClick={() => setFilter(type)}
          />
        ))}
      </div>

      {sortedNotes.length === 0 ? (
        <EmptyState
          title={filter === "mine" ? "You haven't written any notes" : "No notes yet"}
          description="Notes can be added to proposals and candidates to provide context, evidence, or corrections."
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
          ? "bg-brand text-white border-brand"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
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
  const targetLabel = TARGET_TYPE_LABELS[note.target.type] ?? note.target.type;
  const total = note.endorsementCount + note.disputeCount;
  const ratio = total > 0 ? note.endorsementCount / total : 0;
  const isVisible = note.visibility?.visible;
  const isWithdrawn = note.status === "withdrawn";
  const isOwnNote = note.authorId === participantId;
  const markdown = note.content?.markdown ?? fullNote?.content?.markdown;

  const accentClass = isWithdrawn ? "border-l-gray-200 bg-gray-50/50 opacity-60"
    : isVisible ? "border-l-green-400 bg-green-50/40"
    : total > 0 ? "border-l-amber-300 bg-amber-50/30"
    : "border-l-gray-200 bg-gray-50/30";

  return (
    <div className={`border-l-[3px] rounded-r-lg pl-4 pr-4 py-3 ${accentClass}`}>
        {/* Header: author + linked target + metadata */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={authorName} size="xs" />
            <span className="text-sm font-medium text-gray-900">{authorName}</span>
            <span className="text-xs text-gray-400">on</span>
            <Link to={targetLink(assemblyId, note.target)} className="hover:opacity-80 transition-opacity">
              <Badge color="gray">{targetLabel}</Badge>
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isVisible && <Badge color="green">Visible</Badge>}
            {isWithdrawn && <Badge color="gray">Withdrawn</Badge>}
            {note.visibility?.belowMinEvaluations && !isWithdrawn && (
              <Badge color="yellow">Needs reviews</Badge>
            )}
            <span className="text-[10px] text-gray-400">
              {new Date(note.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Expandable content */}
        {expanded && (
          <div className="mt-2">
            {loadingContent && <p className="text-sm text-gray-400">Loading...</p>}
            {markdown ? (
              <p className="text-sm text-gray-700"><NoteContent text={markdown} /></p>
            ) : !loadingContent ? (
              <p className="text-sm text-gray-400 italic">Content not available</p>
            ) : null}
          </div>
        )}

        {/* Footer: read toggle + stats + author actions */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <button onClick={handleExpand} className="text-xs text-gray-500 hover:text-gray-700">
              {expanded ? "Collapse" : "Read"}
            </button>
            <span className="text-gray-200">|</span>
            <span>{note.endorsementCount} helpful</span>
            <span>{note.disputeCount} not helpful</span>
            {total > 0 && (
              <span className={ratio >= 0.7 ? "text-green-600" : ratio <= 0.3 ? "text-red-500" : ""}>
                {Math.round(ratio * 100)}% helpful
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Link to context page */}
            <Link
              to={targetLink(assemblyId, note.target)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              View in context
            </Link>
            {/* Author can withdraw their own note */}
            {isOwnNote && !isWithdrawn && (
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {withdrawing ? "Withdrawing..." : "Withdraw"}
              </button>
            )}
          </div>
        </div>
    </div>
  );
}
