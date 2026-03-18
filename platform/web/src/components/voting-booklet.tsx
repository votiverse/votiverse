/**
 * Voting Booklet — a modal presenting curated arguments for each position,
 * inspired by the Swiss Federal Council's "Erläuterungen des Bundesrates."
 *
 * Phase-aware rendering:
 *   - **Deliberation**: All proposals ranked by endorsement score, endorse buttons
 *   - **Voting/Closed**: Featured (or auto-selected) proposal per position,
 *     recommendation section, "See all" expand
 */

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import * as api from "../api/client.js";
import type { Proposal, BookletData, BookletRecommendation } from "../api/types.js";
import { NotesList } from "./community-notes.js";
import { Badge } from "./ui.js";
import { X, FileText, MessageSquareText, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Star, ChevronDown } from "lucide-react";

const MarkdownViewer = lazy(() =>
  import("./markdown-editor.js").then((m) => ({ default: m.MarkdownViewer })),
);

type EventPhase = "deliberation" | "voting" | "closed";

interface BookletProps {
  assemblyId: string;
  eventId: string;
  issueId: string;
  issueTitle: string;
  issueDescription: string;
  choices?: string[];
  proposals: Proposal[];
  eventPhase: EventPhase;
  isCreator: boolean;
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
  // Sort each group by score (endorsements - disputes) descending
  for (const [, list] of map) {
    list.sort((a, b) => {
      const scoreA = (a.endorsementCount ?? 0) - (a.disputeCount ?? 0);
      const scoreB = (b.endorsementCount ?? 0) - (b.disputeCount ?? 0);
      return scoreB - scoreA;
    });
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
  eventId,
  issueId,
  issueTitle,
  issueDescription,
  choices,
  proposals,
  eventPhase,
  isCreator: _isCreator,
  onClose,
}: BookletProps) {
  // isCreator will be used by CurationPanel (E4)
  void _isCreator;
  const positions = useMemo(() => groupByPosition(proposals), [proposals]);
  const positionKeys = useMemo(() =>
    Array.from(positions.keys()).sort((a, b) => {
      const order: Record<string, number> = { for: 0, against: 1, general: 99 };
      return (order[a] ?? 50) - (order[b] ?? 50);
    }), [positions]);

  const [activeIdx, setActiveIdx] = useState(0);
  const activeKey = positionKeys[activeIdx] ?? positionKeys[0];
  const activeProposals = positions.get(activeKey!) ?? [];

  // Load booklet data for voting/closed phases
  const [bookletData, setBookletData] = useState<BookletData | null>(null);
  const [recommendation, setRecommendation] = useState<BookletRecommendation | null>(null);

  useEffect(() => {
    if (eventPhase === "deliberation") return;
    let cancelled = false;
    api.getBookletProposals(assemblyId, issueId)
      .then((data) => { if (!cancelled) setBookletData(data); })
      .catch(() => {});
    api.getRecommendation(assemblyId, eventId, issueId)
      .then((data) => { if (!cancelled) setRecommendation(data.recommendation); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [assemblyId, eventId, issueId, eventPhase]);

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

  // In voting/closed mode, show featured or top proposal per position
  const getFeaturedProposal = (key: string): Proposal | null => {
    if (bookletData?.positions[key]) {
      return bookletData.positions[key].featured;
    }
    // Fallback to local data
    const posProposals = positions.get(key) ?? [];
    const featured = posProposals.find((p) => p.featured);
    return featured ?? posProposals[0] ?? null;
  };

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
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                Voting Booklet
                {eventPhase === "deliberation" && <span className="ml-2 text-amber-500">Deliberation Phase</span>}
              </p>
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

          {/* Content based on phase */}
          {eventPhase === "deliberation" ? (
            /* DELIBERATION: all proposals ranked by score with endorse buttons */
            <div className="space-y-6">
              {activeProposals.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No proposals in this position yet.</p>
              ) : (
                activeProposals.map((proposal) => (
                  <ProposalSection
                    key={proposal.id}
                    assemblyId={assemblyId}
                    proposal={proposal}
                    showEndorse
                  />
                ))
              )}
            </div>
          ) : (
            /* VOTING/CLOSED: Featured proposal, then "See all" expand */
            <div className="space-y-6">
              {(() => {
                const featured = getFeaturedProposal(activeKey!);
                if (!featured) {
                  return <p className="text-sm text-gray-400 italic">No proposals in this position.</p>;
                }
                return (
                  <>
                    <div className="relative">
                      {featured.featured && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <Star size={12} className="text-amber-500 fill-amber-500" />
                          <span className="text-xs text-amber-600 font-medium">Featured by organizer</span>
                        </div>
                      )}
                      <ProposalSection
                        assemblyId={assemblyId}
                        proposal={featured}
                      />
                    </div>
                    <SeeAllExpander
                      proposals={activeProposals}
                      featuredId={featured.id}
                      assemblyId={assemblyId}
                    />
                  </>
                );
              })()}
            </div>
          )}

          {/* Recommendation section (voting/closed only) */}
          {eventPhase !== "deliberation" && recommendation?.markdown && (
            <div className="mt-8 pt-6 border-t">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 bg-blue-500 rounded-full" />
                <h4 className="text-sm font-semibold text-gray-900">Organizer Recommendation</h4>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 prose prose-sm max-w-none text-gray-700">
                <Suspense fallback={<p className="text-gray-400">Loading...</p>}>
                  <MarkdownViewer content={recommendation.markdown} />
                </Suspense>
              </div>
            </div>
          )}
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

/** "See all N proposals" expander for non-featured proposals. */
function SeeAllExpander({ proposals, featuredId, assemblyId }: {
  proposals: Proposal[];
  featuredId: string;
  assemblyId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const others = proposals.filter((p) => p.id !== featuredId);

  if (others.length === 0) return null;

  return (
    <div className="border-t pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5"
      >
        <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Hide" : `See all ${others.length + 1} proposals`}
      </button>
      {expanded && (
        <div className="mt-4 space-y-6">
          {others.map((p) => (
            <ProposalSection key={p.id} assemblyId={assemblyId} proposal={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Individual proposal within a position section. Fetches full content on mount. */
function ProposalSection({ assemblyId, proposal, showEndorse }: {
  assemblyId: string;
  proposal: Proposal;
  showEndorse?: boolean;
}) {
  const [content, setContent] = useState<string | null>(proposal.content?.markdown ?? null);
  const [loading, setLoading] = useState(!content);
  const [showNotes, setShowNotes] = useState(false);
  const [endorsements, setEndorsements] = useState(proposal.endorsementCount ?? 0);
  const [disputes, setDisputes] = useState(proposal.disputeCount ?? 0);
  const [evaluating, setEvaluating] = useState(false);

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

  const handleEvaluate = async (evaluation: "endorse" | "dispute") => {
    if (evaluating) return;
    setEvaluating(true);
    try {
      await api.evaluateProposal(assemblyId, proposal.id, evaluation);
      if (evaluation === "endorse") setEndorsements((n) => n + 1);
      else setDisputes((n) => n + 1);
    } catch { /* ignore */ }
    setEvaluating(false);
  };

  const score = endorsements - disputes;

  return (
    <div>
      {/* Proposal header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-gray-400 shrink-0" />
          <h4 className="text-sm font-semibold text-gray-900">{proposal.title}</h4>
          <Badge color="gray">v{proposal.currentVersion}</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(endorsements > 0 || disputes > 0) && (
            <span className={`text-xs font-medium ${score > 0 ? "text-green-600" : score < 0 ? "text-red-600" : "text-gray-500"}`}>
              {score > 0 ? "+" : ""}{score}
            </span>
          )}
          {proposal.featured && <Star size={12} className="text-amber-500 fill-amber-500" />}
        </div>
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

      {/* Actions row */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5"
        >
          <MessageSquareText size={12} />
          {showNotes ? "Hide notes" : "Notes"}
        </button>

        {showEndorse && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => handleEvaluate("endorse")}
              disabled={evaluating}
              className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
              title="Endorse"
            >
              <ThumbsUp size={13} />
            </button>
            <span className="text-xs text-gray-400 tabular-nums">{endorsements > 0 ? endorsements : ""}</span>
            <button
              onClick={() => handleEvaluate("dispute")}
              disabled={evaluating}
              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
              title="Dispute"
            >
              <ThumbsDown size={13} />
            </button>
            <span className="text-xs text-gray-400 tabular-nums">{disputes > 0 ? disputes : ""}</span>
          </div>
        )}
      </div>

      {showNotes && (
        <div className="mt-3">
          <NotesList assemblyId={assemblyId} targetType="proposal" targetId={proposal.id} />
        </div>
      )}
    </div>
  );
}
