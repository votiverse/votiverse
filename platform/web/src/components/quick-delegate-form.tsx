import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Star, Search, ChevronDown, ExternalLink, MessageSquareText, Users } from "lucide-react";
import * as api from "../api/client.js";
import { signal } from "../hooks/use-mutation-signal.js";
import type { Topic, Candidacy } from "../api/types.js";
import { Button, Badge, ErrorBox } from "./ui.js";
import { Avatar } from "./avatar.js";
import { MemberSearch } from "./member-search.js";

export interface QuickDelegateFormProps {
  assemblyId: string;
  participantId: string;
  participants: Array<{ id: string; name: string }>;
  /** Pre-selected topic IDs from the issue. */
  preselectedTopicIds: string[];
  /** Full topic list for parent resolution. */
  topics: Topic[];
  /** Whether the assembly supports topic-scoped delegations. */
  isTopicScoped: boolean;
  /** The issue ID for issue-scoped delegation. */
  issueId: string;
  /** Issue title for scope label. */
  issueTitle?: string;
  /** Declared candidates (for expert recommendations). */
  candidates?: Candidacy[];
  /** Topic names for display. */
  topicNameMap?: Map<string, string>;
  onCreated: () => void;
  onClose: () => void;
}

type ScopeMode = "issue" | "topic" | "parent";
type SelectionMode = null | "candidates" | "search";

/**
 * Inline delegation form with scope-first flow.
 * Step 1: Choose scope (issue / subtopic / broader category — no global).
 * Step 2: Choose delegate (candidates accordion OR search all members).
 */
export function QuickDelegateForm({
  assemblyId,
  participantId,
  participants,
  preselectedTopicIds,
  topics,
  isTopicScoped,
  issueId,
  issueTitle,
  candidates,
  topicNameMap: _topicNameMap,
  onCreated,
  onClose,
}: QuickDelegateFormProps) {
  const { t } = useTranslation("governance");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("issue");
  // Skip the choice step when there are no candidates — go straight to search
  const hasCandidates = (candidates ?? []).some(
    (c) => c.status === "active" && c.participantId !== participantId,
  );
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(hasCandidates ? null : "search");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Resolve topic names
  const topicMap = new Map(topics.map((tt) => [tt.id, tt]));
  const topicNames = preselectedTopicIds
    .map((id) => topicMap.get(id)?.name)
    .filter(Boolean)
    .join(", ");

  // Parent topic(s) for "broader" option
  const parentIds = new Set<string>();
  for (const id of preselectedTopicIds) {
    const topic = topicMap.get(id);
    if (topic?.parentId) parentIds.add(topic.parentId);
  }
  const parentTopicIds = [...parentIds];
  const parentNames = parentTopicIds
    .map((id) => topicMap.get(id)?.name)
    .filter(Boolean)
    .join(", ");
  const hasParent = parentTopicIds.length > 0;

  // Filter candidates by topic relevance for the selected scope
  const activeCandidates = (candidates ?? []).filter(
    (c) => c.status === "active" && c.participantId !== participantId,
  );
  const scopeTopicIds = scopeMode === "topic" ? preselectedTopicIds
    : scopeMode === "parent" ? parentTopicIds
    : preselectedTopicIds; // for "issue", use issue's topics as relevance hint
  const recommendedCandidates = activeCandidates.filter((c) =>
    c.topicScope.some((tId) => scopeTopicIds.includes(tId)),
  );
  // All other candidates sorted after recommended
  const otherCandidates = activeCandidates.filter(
    (c) => !recommendedCandidates.includes(c),
  );

  // Don't auto-expand any candidate — all start collapsed to avoid bias.

  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const selectedName = selectedTargetId ? nameMap.get(selectedTargetId) ?? "" : "";

  // Resolve scope for API call
  const resolveScope = (): { topicScope: string[]; issueScope?: string } => {
    if (!isTopicScoped) return { topicScope: [], issueScope: issueId };
    switch (scopeMode) {
      case "issue": return { topicScope: [], issueScope: issueId };
      case "topic": return { topicScope: [...preselectedTopicIds] };
      case "parent": return { topicScope: [...parentTopicIds] };
    }
  };

  const handleConfirm = async () => {
    if (!selectedTargetId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createDelegation(assemblyId, { targetId: selectedTargetId, ...resolveScope(), retractVoteOnIssue: issueId });
      signal("attention");
      onCreated();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setFormError(err.message || t("delegate.permissionDenied"));
      } else {
        setFormError(err instanceof Error ? err.message : t("delegate.createError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const allCandidatesForDisplay = [...recommendedCandidates, ...otherCandidates];

  return (
    <div className="bg-surface-sunken p-4 sm:p-6 rounded-2xl border border-border-strong animate-in fade-in slide-in-from-top-2 duration-300 shadow-inner">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h4 className="font-bold text-lg text-text-primary font-display">{t("quickDelegate.title")}</h4>
          <p className="text-sm text-text-muted">{t("quickDelegate.subtitle")}</p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors">
          <X size={20} />
        </button>
      </div>

      {formError && <ErrorBox message={formError} />}

      {/* STEP 1: Scope selector */}
      {isTopicScoped && preselectedTopicIds.length > 0 && (
        <div className="mb-6">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2.5 block">
            1. {t("quickDelegate.whatDelegating")}
          </span>
          <div className={`grid grid-cols-1 gap-3 ${hasParent ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {/* Issue only */}
            <button type="button" className={scopeCardClass(scopeMode === "issue")} onClick={() => setScopeMode("issue")}>
              <span className="text-sm font-semibold text-text-primary">{t("quickDelegate.scopeIssue")}</span>
              <span className="text-xs text-text-muted leading-snug line-clamp-2">
                {issueTitle ? `"${issueTitle}"` : t("quickDelegate.scopeIssueDesc")}
              </span>
            </button>
            {/* Sub-topic */}
            <button type="button" className={scopeCardClass(scopeMode === "topic")} onClick={() => setScopeMode("topic")}>
              <span className="text-sm font-semibold text-text-primary">{t("quickDelegate.scopeSubtopic")}</span>
              <span className="text-xs text-text-muted leading-snug line-clamp-2">"{topicNames}"</span>
            </button>
            {/* Broader category */}
            {hasParent && (
              <button type="button" className={scopeCardClass(scopeMode === "parent")} onClick={() => setScopeMode("parent")}>
                <span className="text-sm font-semibold text-text-primary">{t("quickDelegate.scopeBroader")}</span>
                <span className="text-xs text-text-muted leading-snug line-clamp-2">{t("quickDelegate.scopeBroaderDesc", { topic: parentNames })}</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="h-px w-full bg-border-subtle mb-6" />

      {/* Scope description for issue-only mode */}
      {(!isTopicScoped || scopeMode === "issue") && (
        <p className="text-xs text-text-muted mb-4 -mt-2">{t("quickDelegate.issueScopeLabel")}</p>
      )}

      {/* STEP 2: Delegate selection */}
      <div className="mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2.5 block">
          {isTopicScoped && preselectedTopicIds.length > 0 ? "2. " : ""}{t("quickDelegate.trustWith")}
        </span>

        {/* Initial state: show candidate summary + two buttons */}
        {selectionMode === null && (
          <div className="bg-surface-sunken border border-border-default p-5 rounded-2xl text-center">
            {/* Stacked avatars */}
            {activeCandidates.length > 0 && (
              <div className="flex justify-center mb-4">
                <div className="flex -space-x-2">
                  {activeCandidates.slice(0, 5).map((c) => (
                    <Avatar key={c.id} name={nameMap.get(c.participantId) ?? ""} size="sm" className="border-2 border-surface-sunken" />
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-text-muted mb-5">
              {activeCandidates.length > 0 ? (
                <>
                  {t("quickDelegate.candidateCount", { total: activeCandidates.length })}.{" "}
                  {recommendedCandidates.length > 0 && (
                    <span className="font-semibold text-accent-text">
                      {t("quickDelegate.expertCount", { count: recommendedCandidates.length })}
                    </span>
                  )}
                </>
              ) : (
                t("quickDelegate.noCandidates")
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              {activeCandidates.length > 0 && (
                <Button
                  variant="secondary"
                  className="flex-1 font-semibold"
                  onClick={() => setSelectionMode("candidates")}
                >
                  <Star size={16} className="text-text-muted mr-1.5" />
                  {t("quickDelegate.viewExperts")}
                </Button>
              )}
              <Button
                variant="secondary"
                className="flex-1 font-semibold"
                onClick={() => setSelectionMode("search")}
              >
                <Search size={16} className="text-text-muted mr-1.5" />
                {t("quickDelegate.searchAll")}
              </Button>
            </div>
          </div>
        )}

        {/* Candidates accordion mode */}
        {selectionMode === "candidates" && (
          <div className="animate-in slide-in-from-right-2 duration-300">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs font-semibold text-accent-text flex items-center gap-1">
                <Star size={12} />
                {recommendedCandidates.length > 0
                  ? t("quickDelegate.recommendedExperts", { count: recommendedCandidates.length })
                  : t("quickDelegate.allCandidates", { count: allCandidatesForDisplay.length })}
              </p>
              <button
                onClick={() => { setSelectionMode(null); setSelectedTargetId(null); setExpandedCandidateId(null); }}
                className="text-xs font-medium text-text-muted hover:text-text-primary min-h-[36px] flex items-center"
              >
                {t("quickDelegate.changeMethod")}
              </button>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
              {allCandidatesForDisplay.map((candidate) => {
                const cName = nameMap.get(candidate.participantId) ?? "";
                const isSelected = selectedTargetId === candidate.participantId;
                const isExpanded = expandedCandidateId === candidate.id;
                const isRecommended = recommendedCandidates.includes(candidate);

                return (
                  <div
                    key={candidate.id}
                    className={`flex flex-col rounded-2xl transition-all border ${
                      isSelected
                        ? "bg-accent-subtle border-accent ring-1 ring-accent"
                        : "bg-surface-raised border-border-default hover:border-border-strong"
                    }`}
                  >
                    {/* Collapsed row — click to expand */}
                    <button
                      type="button"
                      className="flex items-center justify-between p-3.5 text-left w-full"
                      onClick={() => setExpandedCandidateId(isExpanded ? null : candidate.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={cName} size="sm" className="shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text-primary truncate">{cName}</span>
                            {isSelected && <Badge color="green" className="hidden sm:inline-flex">Selected</Badge>}
                          </div>
                          {candidate.title && (
                            <span className="text-xs text-text-muted truncate block">{candidate.title}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isRecommended && !isSelected && (
                          <Star size={12} className="text-accent-text hidden sm:block" />
                        )}
                        <ChevronDown
                          size={16}
                          className={`text-text-tertiary transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-0 animate-in fade-in slide-in-from-top-1 duration-200">
                        {/* Topic badges */}
                        {candidate.topicScope.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {candidate.topicScope.map((tId) => (
                              <Badge key={tId} color="blue" className="text-[10px]">
                                {topics.find((t) => t.id === tId)?.name ?? tId.slice(0, 8)}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Statement excerpt — more informative than badges */}
                        {candidate.content?.markdown && (
                          <p className="text-sm text-text-secondary leading-relaxed line-clamp-2 mb-3">
                            {extractPlainText(candidate.content.markdown)}
                          </p>
                        )}

                        {/* Links + action */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border-subtle">
                          <div className="flex items-center gap-3">
                            <a
                              href={`/assembly/${assemblyId}/candidacies/${candidate.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-info-text hover:underline flex items-center gap-1 min-h-[36px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("quickDelegate.viewProfile")} <ExternalLink size={10} />
                            </a>
                            <a
                              href={`/assembly/${assemblyId}/candidacies/${candidate.id}#notes`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-text-muted hover:text-text-secondary flex items-center gap-1 min-h-[36px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MessageSquareText size={10} /> {t("quickDelegate.communityNotes")}
                            </a>
                          </div>
                          <Button
                            size="sm"
                            variant={isSelected ? "secondary" : "primary"}
                            className="w-full sm:w-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTargetId(isSelected ? null : candidate.participantId);
                            }}
                          >
                            {isSelected ? t("quickDelegate.deselect") : t("quickDelegate.selectDelegate")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search mode */}
        {selectionMode === "search" && (
          <div className="animate-in slide-in-from-right-2 duration-200">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs font-semibold text-text-secondary">{t("quickDelegate.searchDirectory")}</p>
              {hasCandidates && (
                <button
                  onClick={() => { setSelectionMode(null); setSelectedTargetId(null); }}
                  className="text-xs font-medium text-text-muted hover:text-text-primary min-h-[36px] flex items-center"
                >
                  {t("quickDelegate.changeMethod")}
                </button>
              )}
            </div>
            {selectedTargetId ? (
              <div className="flex items-center gap-3 bg-surface-raised border border-accent rounded-xl px-4 py-3">
                <Avatar name={selectedName} size="sm" />
                <span className="text-sm font-semibold text-text-primary flex-1">{selectedName}</span>
                <button
                  type="button"
                  onClick={() => setSelectedTargetId(null)}
                  className="text-xs text-text-muted hover:text-text-secondary min-h-[32px]"
                >
                  {t("delegations.change")}
                </button>
              </div>
            ) : (
              <MemberSearch
                participants={participants}
                currentParticipantId={participantId}
                onSelect={(id) => setSelectedTargetId(id)}
                placeholder={t("quickDelegate.searchPlaceholder")}
              />
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-border-subtle">
        <Button variant="secondary" onClick={onClose}>
          {t("common:cancel")}
        </Button>
        <Button onClick={handleConfirm} disabled={submitting || !selectedTargetId}>
          {submitting ? t("delegations.delegating") : t("delegates.confirmDelegation")}
        </Button>
      </div>
    </div>
  );
}

/** Trigger button shown below voting buttons. */
export function QuickDelegateTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("governance");
  return (
    <div className="flex justify-center pt-3">
      <button
        onClick={onClick}
        className="text-sm font-medium text-info-text opacity-80 hover:opacity-100 flex items-center justify-center gap-1.5 min-h-[44px] transition-all"
      >
        <Users size={16} />
        {t("quickDelegate.trustCta")}
      </button>
    </div>
  );
}

function scopeCardClass(selected: boolean): string {
  return `flex flex-col gap-1 p-3.5 rounded-xl border cursor-pointer transition-all ${
    selected
      ? "border-accent bg-surface-raised shadow-sm ring-1 ring-accent"
      : "border-border-default bg-surface-raised hover:border-border-strong"
  }`;
}

/** Strip markdown formatting to get a plain text excerpt. */
function extractPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+.*$/gm, "") // remove headings
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/^[-*]\s+/gm, "") // list markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\n{2,}/g, " ") // collapse multiple newlines
    .replace(/\n/g, " ") // single newlines to spaces
    .trim();
}
