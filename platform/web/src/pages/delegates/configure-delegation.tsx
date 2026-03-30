import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api/client.js";
import { signal } from "../../hooks/use-mutation-signal.js";
import { Card, CardBody, Button, ErrorBox } from "../../components/ui.js";
import { Avatar } from "../../components/avatar.js";
import { TopicPicker } from "../../components/topic-picker.js";
import { ChevronLeft } from "lucide-react";

export function ConfigureDelegation({
  groupId,
  targetId,
  targetName,
  candidacyTopics,
  isTopicScoped,
  onConfirm,
  onBack,
}: {
  groupId: string;
  targetId: string;
  targetName: string;
  candidacyTopics?: string[];
  isTopicScoped: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("governance");
  const [scopeMode, setScopeMode] = useState<"all" | "specific">("all");
  const [topicScope, setTopicScope] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const firstName = targetName.split(" ")[0] ?? targetName;

  const handleSubmit = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const resolvedScope = scopeMode === "specific" ? topicScope : [];
      await api.createDelegation(groupId, { targetId, topicScope: resolvedScope });
      signal("attention");
      onConfirm();
    } catch (err: unknown) {
      if (err instanceof api.ApiError && err.status === 403) {
        setFormError(err.message || t("delegate.permissionDenied"));
      } else {
        setFormError(err instanceof Error ? err.message : t("delegations.failedCreate"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Back breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        <ChevronLeft size={16} />
        {t("delegates.backToProfile")}
      </button>

      {/* Heading */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight mb-1">
          {t("delegates.configureTitle")}
        </h1>
        <p className="text-sm text-text-muted">
          {t("delegates.configureSubtitle", { name: targetName })}
        </p>
      </div>

      {/* Delegate confirmation */}
      <div className="flex items-center gap-3 bg-surface-sunken rounded-xl px-4 py-3">
        <Avatar name={targetName} size="md" />
        <div>
          <p className="text-sm font-semibold text-text-primary">{targetName}</p>
          <p className="text-xs text-text-muted">{t("delegates.delegateTo", { name: firstName })}</p>
        </div>
      </div>

      {formError && <ErrorBox message={formError} />}

      {/* Scope selection */}
      <Card>
        <CardBody className="space-y-3">
          {/* All topics */}
          <label
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              scopeMode === "all"
                ? "border-accent bg-accent-subtle"
                : "border-border-default hover:border-border-strong bg-surface-raised"
            }`}
          >
            <input
              type="radio"
              name="delegation-scope"
              checked={scopeMode === "all"}
              onChange={() => setScopeMode("all")}
              className="mt-0.5 text-accent focus:ring-focus-ring"
            />
            <div>
              <div className="text-sm font-semibold text-text-primary">{t("delegates.allTopicsCard")}</div>
              <div className="text-xs text-text-muted mt-0.5">
                {t("delegates.allTopicsDesc", { name: firstName })}
              </div>
            </div>
          </label>

          {/* Specific topics */}
          {isTopicScoped && (
            <>
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  scopeMode === "specific"
                    ? "border-accent bg-accent-subtle"
                    : "border-border-default hover:border-border-strong bg-surface-raised"
                }`}
              >
                <input
                  type="radio"
                  name="delegation-scope"
                  checked={scopeMode === "specific"}
                  onChange={() => setScopeMode("specific")}
                  className="mt-0.5 text-accent focus:ring-focus-ring"
                />
                <div>
                  <div className="text-sm font-semibold text-text-primary">{t("delegates.specificTopicsCard")}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {t("delegates.specificTopicsDesc", { name: firstName })}
                  </div>
                </div>
              </label>

              {/* Topic picker (shown when specific is selected) */}
              {scopeMode === "specific" && (
                <div className="ml-7 mt-2 p-3 bg-surface rounded-lg border border-border-subtle">
                  <TopicPicker
                    groupId={groupId}
                    value={topicScope}
                    onChange={setTopicScope}
                    highlightTopics={candidacyTopics}
                  />
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onBack}>
          {t("common:cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || (scopeMode === "specific" && topicScope.length === 0)}
        >
          {submitting ? t("delegations.delegating") : t("delegates.confirmDelegation")}
        </Button>
      </div>
    </div>
  );
}
