import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Input, Select } from "./ui.js";

// ── Shared issue-list editor ──────────────────────────────────────────
//
// Used by both the create-vote form (events-list.tsx) and the "Add question"
// control on the event detail page. Editing the issue set lives in one place
// so the two never drift.

export interface IssueDraft {
  title: string;
  description: string;
  topicId: string | null;
  voteType: "binary" | "choices";
  choices: string[];
}

export function newIssueDraft(): IssueDraft {
  return { title: "", description: "", topicId: null, voteType: "binary", choices: ["", ""] };
}

/** Maps a draft to the API issue shape (trims text; choices only when relevant). */
export function issueDraftToApi(i: IssueDraft): {
  title: string;
  description: string;
  topicId: string | null;
  choices?: string[];
} {
  return {
    title: i.title.trim(),
    description: i.description.trim(),
    topicId: i.topicId,
    ...(i.voteType === "choices" ? { choices: i.choices.map((c) => c.trim()).filter(Boolean) } : {}),
  };
}

export function IssueListEditor({
  issues,
  onChange,
  topicOptions,
  minIssues = 1,
}: {
  issues: IssueDraft[];
  onChange: (issues: IssueDraft[]) => void;
  topicOptions: { id: string; label: string }[];
  /** Issues cannot be removed below this count (default 1). */
  minIssues?: number;
}) {
  const { t } = useTranslation("governance");

  const addIssue = () => onChange([...issues, newIssueDraft()]);
  const removeIssue = (idx: number) => {
    if (issues.length <= minIssues) return;
    onChange(issues.filter((_, i) => i !== idx));
  };
  const updateIssue = <K extends keyof IssueDraft>(idx: number, field: K, value: IssueDraft[K]) => {
    onChange(issues.map((issue, i) => (i === idx ? { ...issue, [field]: value } : issue)));
  };
  const updateChoice = (issueIdx: number, choiceIdx: number, value: string) => {
    onChange(issues.map((issue, i) => {
      if (i !== issueIdx) return issue;
      const choices = [...issue.choices];
      choices[choiceIdx] = value;
      return { ...issue, choices };
    }));
  };
  const addChoice = (issueIdx: number) => {
    onChange(issues.map((issue, i) => (i === issueIdx ? { ...issue, choices: [...issue.choices, ""] } : issue)));
  };
  const removeChoice = (issueIdx: number, choiceIdx: number) => {
    onChange(issues.map((issue, i) => {
      if (i !== issueIdx || issue.choices.length <= 2) return issue;
      return { ...issue, choices: issue.choices.filter((_, ci) => ci !== choiceIdx) };
    }));
  };

  return (
    <div className="space-y-4">
      {issues.map((issue, idx) => (
        <div key={idx} className="border border-border-default rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-muted">{t("eventsList.issueNumber", { n: idx + 1 })}</span>
            {issues.length > minIssues && (
              <button type="button" onClick={() => removeIssue(idx)} className="ml-auto text-text-tertiary hover:text-error-text">
                <X size={14} />
              </button>
            )}
          </div>
          <Input
            value={issue.title}
            onChange={(e) => updateIssue(idx, "title", e.target.value)}
            placeholder={t("eventsList.issueTitlePlaceholder")}
          />
          <Input
            value={issue.description}
            onChange={(e) => updateIssue(idx, "description", e.target.value)}
            placeholder={t("eventsList.descOptionalPlaceholder")}
          />

          {/* Topic selector */}
          {topicOptions.length > 0 && (
            <Select
              value={issue.topicId ?? ""}
              onChange={(e) => updateIssue(idx, "topicId", e.target.value || null)}
            >
              <option value="">{t("eventsList.noTopic")}</option>
              {topicOptions.map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.label}</option>
              ))}
            </Select>
          )}

          {/* Vote type */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                checked={issue.voteType === "binary"}
                onChange={() => updateIssue(idx, "voteType", "binary")}
              />
              {t("eventsList.forAgainst")}
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                checked={issue.voteType === "choices"}
                onChange={() => updateIssue(idx, "voteType", "choices")}
              />
              {t("eventsList.multipleChoice")}
            </label>
          </div>

          {/* Custom choices */}
          {issue.voteType === "choices" && (
            <div className="space-y-1.5 ml-4">
              {issue.choices.map((choice, ci) => (
                <div key={ci} className="flex items-center gap-1.5">
                  <Input
                    value={choice}
                    onChange={(e) => updateChoice(idx, ci, e.target.value)}
                    placeholder={t("eventsList.choicePlaceholder", { n: ci + 1 })}
                    className="flex-1"
                  />
                  {issue.choices.length > 2 && (
                    <button type="button" onClick={() => removeChoice(idx, ci)} className="text-text-tertiary hover:text-error-text p-1">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => addChoice(idx)} className="text-xs text-accent-text hover:text-accent-text">
                {t("eventsList.addChoice")}
              </button>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={addIssue} className="text-sm text-accent-text hover:text-accent-text min-h-[44px] sm:min-h-0 flex items-center">
        {t("eventsList.addIssue")}
      </button>
    </div>
  );
}
