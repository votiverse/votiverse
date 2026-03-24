import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { CommunityNote } from "../api/types.js";
import { Button, Badge } from "./ui.js";
import { ThumbsUp, ThumbsDown } from "lucide-react";

/** Sort notes by relevance: visible first, then by endorsement count, then recent. */
export function sortNotesByRelevance(notes: CommunityNote[]): CommunityNote[] {
  return [...notes].sort((a, b) => {
    // Withdrawn last
    if (a.status === "withdrawn" !== (b.status === "withdrawn")) return a.status === "withdrawn" ? 1 : -1;
    // Visible above non-visible
    const aVis = a.visibility?.visible ? 0 : 1;
    const bVis = b.visibility?.visible ? 0 : 1;
    if (aVis !== bVis) return aVis - bVis;
    // More endorsements first
    if (a.endorsementCount !== b.endorsementCount) return b.endorsementCount - a.endorsementCount;
    // Then recent first
    return b.createdAt - a.createdAt;
  });
}

// ---------------------------------------------------------------------------
// NoteContent — renders plain text with auto-linked URLs and markdown links
// ---------------------------------------------------------------------------

/**
 * Renders note text with:
 * - Markdown links: [text](url) → <a href="url">text</a>
 * - Bare URLs: https://... → <a href="url">url</a>
 * Everything else is plain text with preserved whitespace.
 */
export function NoteContent({ text }: { text: string }) {
  // Combined regex: markdown links first (greedy), then bare URLs
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
  const parts: Array<{ type: "text" | "link"; value: string; href?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    if (match[1] && match[2]) {
      // Markdown link: [text](url)
      parts.push({ type: "link", value: match[1], href: match[2] });
    } else if (match[3]) {
      // Bare URL
      parts.push({ type: "link", value: match[3], href: match[3] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-info-text hover:text-info-text underline break-all"
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  );
}

export function NotesList({ assemblyId, targetType, targetId }: {
  assemblyId: string;
  targetType: string;
  targetId: string;
}) {
  const { t } = useTranslation("governance");
  const { data, loading, refetch } = useApi(
    () => api.listNotes(assemblyId, targetType, targetId),
    [assemblyId, targetType, targetId],
  );
  const [showForm, setShowForm] = useState(false);

  const rawNotes = data?.notes ?? [];
  const notes = useMemo(() => sortNotesByRelevance(rawNotes), [rawNotes]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-text-secondary">
          {t("notes.title")} {notes.length > 0 && `(${notes.length})`}
        </h4>
        <button
          className="text-sm text-info-text hover:text-info-text"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? t("common:cancel") : t("notes.add")}
        </button>
      </div>

      {showForm && (
        <NoteForm
          assemblyId={assemblyId}
          targetType={targetType}
          targetId={targetId}
          onCreated={() => { setShowForm(false); refetch(); }}
        />
      )}

      {loading && <p className="text-sm text-text-tertiary">{t("notes.loading")}</p>}

      {notes.length === 0 && !loading && (
        <p className="text-sm text-text-tertiary">{t("notes.empty")}</p>
      )}

      <div className="space-y-2">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} assemblyId={assemblyId} onEvaluated={refetch} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note, assemblyId, onEvaluated }: {
  note: CommunityNote;
  assemblyId: string;
  onEvaluated: () => void;
}) {
  const { t } = useTranslation("governance");
  const [evaluating, setEvaluating] = useState(false);

  const handleEvaluate = async (evaluation: "endorse" | "dispute") => {
    setEvaluating(true);
    try {
      await api.evaluateNote(assemblyId, note.id, evaluation);
      onEvaluated();
    } catch {
      // Self-evaluation or other errors
    } finally {
      setEvaluating(false);
    }
  };

  const total = note.endorsementCount + note.disputeCount;
  const ratio = total > 0 ? note.endorsementCount / total : 0;
  const isVisible = note.visibility?.visible;

  return (
    <div className={`border-l-[3px] rounded-r-lg pl-3 pr-3 py-2.5 text-sm ${
      note.status === "withdrawn" ? "border-l-border-default bg-surface/50 opacity-60" :
      isVisible ? "border-l-green-400 bg-success-subtle/40" :
      total > 0 ? "border-l-warning-border bg-warning-subtle/30" :
      "border-l-border-default bg-surface/30"
    }`}>
      {note.content?.markdown && (
        <p className="text-text-secondary"><NoteContent text={note.content.markdown} /></p>
      )}
      {!note.content?.markdown && (
        <p className="text-text-tertiary italic">{t("notes.unavailable")}</p>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
        <span>{note.endorsementCount} {t("notes.helpful")}</span>
        <span>{note.disputeCount} {t("notes.disputed")}</span>
        {total > 0 && <span>{t("notes.helpfulPercent", { percent: Math.round(ratio * 100) })}</span>}
        {note.status === "withdrawn" && <Badge color="gray">{t("notes.withdrawn")}</Badge>}
        {isVisible && <Badge color="green">{t("notes.visible")}</Badge>}
      </div>

      {note.status !== "withdrawn" && (
        <div className="flex gap-3 mt-2">
          <button
            className="text-xs text-success-text hover:text-success-text disabled:opacity-50 inline-flex items-center gap-1"
            onClick={() => handleEvaluate("endorse")}
            disabled={evaluating}
          >
            <ThumbsUp size={12} /> {t("notes.endorseBtn")}
          </button>
          <button
            className="text-xs text-error-text hover:text-error-text disabled:opacity-50 inline-flex items-center gap-1"
            onClick={() => handleEvaluate("dispute")}
            disabled={evaluating}
          >
            <ThumbsDown size={12} /> {t("notes.disputeBtn")}
          </button>
        </div>
      )}
    </div>
  );
}

function NoteForm({ assemblyId, targetType, targetId, onCreated }: {
  assemblyId: string;
  targetType: string;
  targetId: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation("governance");
  const [markdown, setMarkdown] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!markdown.trim()) return;
    setSubmitting(true);
    try {
      await api.createNote(assemblyId, { markdown, targetType, targetId });
      setMarkdown("");
      onCreated();
    } catch (err) {
      console.error("Failed to create note:", err instanceof Error ? err.message : err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-4 border rounded-lg p-3 bg-info-subtle">
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        rows={3}
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder={t("notes.placeholder")}
      />
      <div className="mt-2">
        <Button onClick={handleSubmit} disabled={submitting || !markdown.trim()}>
          {submitting ? t("notes.posting") : t("notes.postBtn")}
        </Button>
      </div>
    </div>
  );
}
