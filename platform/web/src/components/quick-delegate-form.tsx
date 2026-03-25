import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import type { Topic, Candidacy } from "../api/types.js";
import { Card, CardBody, Button, Label, ErrorBox } from "./ui.js";
import { Avatar } from "./avatar.js";
import { MemberSearch } from "./member-search.js";

export interface QuickDelegateFormProps {
  assemblyId: string;
  participantId: string;
  participants: Array<{ id: string; name: string }>;
  /** Pre-selected topic IDs from the issue (empty for non-topic-scoped assemblies). */
  preselectedTopicIds: string[];
  /** Full topic list for parent resolution. */
  topics: Topic[];
  /** Whether the assembly supports topic-scoped delegations. */
  isTopicScoped: boolean;
  /** The issue ID for issue-scoped delegation. */
  issueId: string;
  /** Declared candidates (shown featured in member search). */
  candidates?: Candidacy[];
  /** Topic names for candidate topic badges. */
  topicNameMap?: Map<string, string>;
  onCreated: () => void;
  onClose: () => void;
}

type ScopeMode = "issue" | "topic" | "parent" | "global";

/**
 * Compact inline delegation form for the 2-click flow.
 * Pick a person, confirm. Scope is pre-configured from the vote's topic.
 */
export function QuickDelegateForm({
  assemblyId,
  participantId,
  participants,
  preselectedTopicIds,
  topics,
  isTopicScoped,
  issueId,
  candidates,
  topicNameMap,
  onCreated,
  onClose,
}: QuickDelegateFormProps) {
  const { t } = useTranslation("governance");
  const [targetId, setTargetId] = useState("");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("issue");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Resolve topic names for scope labels
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  const topicNames = preselectedTopicIds
    .map((id) => topicMap.get(id)?.name)
    .filter(Boolean)
    .join(", ");

  // Find parent topic(s) for the "broader" option
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

  // Compute topicScope and issueScope based on selected scope mode
  const resolveScope = (): { topicScope: string[]; issueScope?: string } => {
    if (!isTopicScoped) return { topicScope: [] };
    switch (scopeMode) {
      case "issue": return { topicScope: [], issueScope: issueId };
      case "topic": return { topicScope: [...preselectedTopicIds] };
      case "parent": return { topicScope: [...parentTopicIds] };
      case "global": return { topicScope: [] };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const scope = resolveScope();
      await api.createDelegation(assemblyId, {
        targetId,
        ...scope,
      });
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

  const selectedName = participants.find((p) => p.id === targetId)?.name;

  return (
    <Card className="mt-3">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">{t("delegate.title")}</h3>

          {formError && <ErrorBox message={formError} />}

          {/* Person picker */}
          <div>
            <Label>{t("delegate.whoLabel")}</Label>
            {targetId ? (
              <div className="flex items-center gap-2 border border-border-default rounded-xl px-3 py-2">
                <Avatar name={selectedName ?? "?"} size="sm" />
                <span className="text-sm font-medium text-text-primary flex-1">{selectedName}</span>
                <button
                  type="button"
                  onClick={() => setTargetId("")}
                  className="text-xs text-text-tertiary hover:text-text-secondary"
                >
                  {t("delegations.change")}
                </button>
              </div>
            ) : (
              <MemberSearch
                participants={participants}
                currentParticipantId={participantId}
                onSelect={setTargetId}
                candidates={candidates}
                topicNameMap={topicNameMap}
              />
            )}
          </div>

          {/* Scope selector — only for topic-scoped assemblies with topic context */}
          {isTopicScoped && preselectedTopicIds.length > 0 && (
            <div>
              <Label>{t("delegate.scope")}</Label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quick-scope"
                    checked={scopeMode === "issue"}
                    onChange={() => setScopeMode("issue")}
                    className="text-accent focus:ring-focus-ring"
                  />
                  <span className="text-sm text-text-secondary">{t("delegate.scopeIssue")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quick-scope"
                    checked={scopeMode === "topic"}
                    onChange={() => setScopeMode("topic")}
                    className="text-accent focus:ring-focus-ring"
                  />
                  <span className="text-sm text-text-secondary">
                    {t("delegate.scopeTopic")}: <span className="font-medium">{topicNames}</span>
                  </span>
                </label>
                {hasParent && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="quick-scope"
                      checked={scopeMode === "parent"}
                      onChange={() => setScopeMode("parent")}
                      className="text-accent focus:ring-focus-ring"
                    />
                    <span className="text-sm text-text-secondary">
                      {t("delegate.scopeBroader")}: <span className="font-medium">{parentNames}</span>
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quick-scope"
                    checked={scopeMode === "global"}
                    onChange={() => setScopeMode("global")}
                    className="text-accent focus:ring-focus-ring"
                  />
                  <span className="text-sm text-text-secondary">{t("delegate.scopeGlobal")}</span>
                </label>
              </div>
            </div>
          )}

          {/* Selected delegate preview */}
          {targetId && (
            <div className="flex items-center gap-2 bg-surface rounded-md px-3 py-2">
              <Avatar name={selectedName ?? "?"} size="xs" />
              <span className="text-sm text-text-secondary">
                <span className="font-medium">{selectedName}</span>
                {" "}{t("delegate.previewWillVote")}
                {isTopicScoped && scopeMode === "issue" ? ` ${t("delegate.previewIssueOnly")}` : ""}
                {isTopicScoped && scopeMode === "topic" && topicNames ? ` ${t("delegate.previewOnTopic", { topic: topicNames })}` : ""}
                {isTopicScoped && scopeMode === "parent" && parentNames ? ` ${t("delegate.previewOnTopic", { topic: parentNames })}` : ""}
                {(!isTopicScoped || scopeMode === "global") ? ` ${t("delegate.previewAllTopics")}` : ""}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting || !targetId}>
              {submitting ? t("delegate.delegating") : t("delegate.submit")}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-text-muted hover:text-text-secondary min-h-[36px] px-2"
            >
              {t("common:cancel")}
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
