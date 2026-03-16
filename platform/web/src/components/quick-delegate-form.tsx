import { useState } from "react";
import * as api from "../api/client.js";
import type { Topic } from "../api/types.js";
import { Card, CardBody, Button, Select, Label, ErrorBox } from "./ui.js";
import { Avatar } from "./avatar.js";

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
  onCreated: () => void;
  onClose: () => void;
}

type ScopeMode = "topic" | "parent" | "global";

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
  onCreated,
  onClose,
}: QuickDelegateFormProps) {
  const [targetId, setTargetId] = useState("");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("topic");
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

  // Compute topicScope based on selected scope mode
  const resolveTopicScope = (): string[] => {
    if (!isTopicScoped) return [];
    switch (scopeMode) {
      case "topic": return [...preselectedTopicIds];
      case "parent": return [...parentTopicIds];
      case "global": return [];
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createDelegation(assemblyId, {
        targetId,
        topicScope: resolveTopicScope(),
      });
      onCreated();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setFormError(err.message || "You don't have permission to create this delegation.");
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to create delegation");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const others = participants.filter((p) => p.id !== participantId);

  return (
    <Card className="mt-3">
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Delegate this vote</h3>

          {formError && <ErrorBox message={formError} />}

          {/* Person picker */}
          <div>
            <Label>Who should vote for you?</Label>
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Select a member...</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          {/* Scope selector — only for topic-scoped assemblies with topic context */}
          {isTopicScoped && preselectedTopicIds.length > 0 && (
            <div>
              <Label>Scope</Label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quick-scope"
                    checked={scopeMode === "topic"}
                    onChange={() => setScopeMode("topic")}
                    className="text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-gray-700">
                    This topic: <span className="font-medium">{topicNames}</span>
                  </span>
                </label>
                {hasParent && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="quick-scope"
                      checked={scopeMode === "parent"}
                      onChange={() => setScopeMode("parent")}
                      className="text-brand focus:ring-brand"
                    />
                    <span className="text-sm text-gray-700">
                      Broader: <span className="font-medium">{parentNames}</span>
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="quick-scope"
                    checked={scopeMode === "global"}
                    onChange={() => setScopeMode("global")}
                    className="text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-gray-700">All topics</span>
                </label>
              </div>
            </div>
          )}

          {/* Selected delegate preview */}
          {targetId && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
              <Avatar name={others.find((p) => p.id === targetId)?.name ?? "?"} size="xs" />
              <span className="text-sm text-gray-700">
                <span className="font-medium">{others.find((p) => p.id === targetId)?.name}</span>
                {" will vote for you"}
                {isTopicScoped && scopeMode === "topic" && topicNames ? ` on ${topicNames}` : ""}
                {isTopicScoped && scopeMode === "parent" && parentNames ? ` on ${parentNames}` : ""}
                {(!isTopicScoped || scopeMode === "global") ? " on all topics" : ""}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting || !targetId}>
              {submitting ? "Delegating..." : "Delegate"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 min-h-[36px] px-2"
            >
              Cancel
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
