/**
 * Voting Booklet — a modal presenting arguments for each position on an issue,
 * inspired by the Swiss Federal Council's "Erläuterungen des Bundesrates."
 *
 * Structure per issue:
 *   1. Issue context (title, description)
 *   2. One section per voting option with the proposal argument
 *   3. Community notes per proposal
 */

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import * as api from "../api/client.js";
import type { Proposal } from "../api/types.js";
import { NotesList } from "./community-notes.js";
import { Badge } from "./ui.js";
import { X, FileText, MessageSquareText, ChevronLeft, ChevronRight } from "lucide-react";

const MarkdownViewer = lazy(() =>
  import("./markdown-editor.js").then((m) => ({ default: m.MarkdownViewer })),
);

interface BookletProps {
  assemblyId: string;
  issueId: string;
  issueTitle: string;
  issueDescription: string;
  choices?: string[];
  proposals: Proposal[];
  onClose: () => void;
}

/** Group proposals by choiceKey. Proposals without a choiceKey go into "general". */
function groupByPosition(proposals: Proposal[]): Map<string, Proposal[]> {
  const map = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const key = p.choiceKey ?? "general";
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return map;
}

const POSITION_LABELS: Record<string, string> = {
  for: "Arguments For",
  against: "Arguments Against",
  abstain: "Case for Abstaining",
  general: "General Analysis",
};

function positionLabel(key: string): string {
  return POSITION_LABELS[key] ?? `Arguments for "${key}"`;
}

const POSITION_COLORS: Record<string, string> = {
  for: "bg-green-50 border-green-200",
  against: "bg-red-50 border-red-200",
  general: "bg-gray-50 border-gray-200",
};

function positionColor(key: string): string {
  return POSITION_COLORS[key] ?? "bg-blue-50 border-blue-200";
}

const POSITION_ACCENT: Record<string, string> = {
  for: "text-green-700",
  against: "text-red-700",
  general: "text-gray-700",
};

function positionAccent(key: string): string {
  return POSITION_ACCENT[key] ?? "text-blue-700";
}

export function VotingBooklet({
  assemblyId,
  issueTitle,
  issueDescription,
  choices,
  proposals,
  onClose,
}: BookletProps) {
  const positions = groupByPosition(proposals);
  const positionKeys = Array.from(positions.keys()).sort((a, b) => {
    // "for" first, "against" second, "general" last, others alphabetical
    const order: Record<string, number> = { for: 0, against: 1, general: 99 };
    return (order[a] ?? 50) - (order[b] ?? 50);
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const activeKey = positionKeys[activeIdx] ?? positionKeys[0];
  const activeProposals = positions.get(activeKey!) ?? [];

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const goNext = useCallback(() => setActiveIdx((i) => Math.min(i + 1, positionKeys.length - 1)), [positionKeys.length]);
  const goPrev = useCallback(() => setActiveIdx((i) => Math.max(i - 1, 0)), []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] mt-[5vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gray-50 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Voting Booklet</p>
              <h2 className="text-lg font-semibold text-gray-900">{issueTitle}</h2>
              {issueDescription && (
                <p className="text-sm text-gray-500 mt-1">{issueDescription}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100 shrink-0"
              aria-label="Close booklet"
            >
              <X size={20} />
            </button>
          </div>

          {/* Position tabs */}
          {positionKeys.length > 1 && (
            <div className="flex gap-2 mt-4">
              {positionKeys.map((key, idx) => (
                <button
                  key={key}
                  onClick={() => setActiveIdx(idx)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    idx === activeIdx
                      ? `${positionColor(key)} ${positionAccent(key)} font-medium`
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {positionLabel(key)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Section header */}
          <div className="mb-4">
            <h3 className={`text-base font-semibold ${positionAccent(activeKey!)}`}>
              {positionLabel(activeKey!)}
            </h3>
            {choices && activeKey !== "general" && (
              <p className="text-xs text-gray-400 mt-0.5">
                {activeKey === "for" || activeKey === "against"
                  ? `This section argues for voting "${activeKey}"`
                  : `This section argues for choosing "${activeKey}"`}
              </p>
            )}
          </div>

          {/* Proposals in this position */}
          <div className="space-y-6">
            {activeProposals.map((proposal) => (
              <ProposalSection
                key={proposal.id}
                assemblyId={assemblyId}
                proposal={proposal}
              />
            ))}
          </div>
        </div>

        {/* Footer — navigation */}
        {positionKeys.length > 1 && (
          <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between shrink-0">
            <button
              onClick={goPrev}
              disabled={activeIdx === 0}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default inline-flex items-center gap-1"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="text-xs text-gray-400">
              {activeIdx + 1} of {positionKeys.length} positions
            </span>
            <button
              onClick={goNext}
              disabled={activeIdx === positionKeys.length - 1}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default inline-flex items-center gap-1"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Individual proposal within a position section. Fetches full content on mount. */
function ProposalSection({ assemblyId, proposal }: {
  assemblyId: string;
  proposal: Proposal;
}) {
  const [content, setContent] = useState<string | null>(proposal.content?.markdown ?? null);
  const [loading, setLoading] = useState(!content);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (content) return;
    let cancelled = false;
    api.getProposal(assemblyId, proposal.id)
      .then((full) => {
        if (!cancelled) setContent(full.content?.markdown ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assemblyId, proposal.id, content]);

  return (
    <div>
      {/* Proposal header */}
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-gray-400 shrink-0" />
        <h4 className="text-sm font-semibold text-gray-900">{proposal.title}</h4>
        <Badge color="gray">v{proposal.currentVersion}</Badge>
      </div>

      {/* Proposal body */}
      <div className="prose prose-sm max-w-none text-gray-700">
        {loading && <p className="text-gray-400">Loading...</p>}
        {content ? (
          <Suspense fallback={<p className="text-gray-400">Loading...</p>}>
            <MarkdownViewer content={content} />
          </Suspense>
        ) : !loading ? (
          <p className="text-gray-400 italic">Content not available</p>
        ) : null}
      </div>

      {/* Notes toggle */}
      <div className="mt-3">
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5"
        >
          <MessageSquareText size={12} />
          {showNotes ? "Hide notes" : "Notes"}
        </button>
        {showNotes && (
          <div className="mt-3">
            <NotesList assemblyId={assemblyId} targetType="proposal" targetId={proposal.id} />
          </div>
        )}
      </div>
    </div>
  );
}
