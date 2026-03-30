import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, ErrorBox } from "../components/ui.js";
import { signal } from "../hooks/use-mutation-signal.js";
import { VotingConfigForm, QUADRANT_DEFAULTS, QUADRANT_DELEGATION, toGovernanceConfig } from "../components/voting-config-form.js";
import type { VotingConfig } from "../components/voting-config-form.js";

// ── Page ─────────────────────────────────────────────────────────────────

export function CreateGroup() {
  const { t } = useTranslation("governance");
  const navigate = useNavigate();

  // Group basics
  const [name, setName] = useState("");
  const [admissionMode, setAdmissionMode] = useState<"open" | "approval" | "invite-only">("approval");
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Capabilities (community notes always enabled — managed in group settings)
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [scoringEnabled, setScoringEnabled] = useState(false);
  const [surveysEnabled, setSurveysEnabled] = useState(false);

  // Voting config (only relevant when voting is enabled)
  const [votingConfig, setVotingConfig] = useState<VotingConfig>(QUADRANT_DEFAULTS.liquid);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const capabilities: string[] = ["community_notes"];
      if (votingEnabled) capabilities.push("voting");
      if (scoringEnabled) capabilities.push("scoring");
      if (surveysEnabled) capabilities.push("surveys");

      const params: Parameters<typeof api.createGroup>[0] = {
        name: name.trim(),
        admissionMode,
        websiteUrl: websiteUrl.trim() || undefined,
        capabilities,
      };

      if (votingEnabled) {
        params.config = toGovernanceConfig(votingConfig);
      }

      const group = await api.createGroup(params);
      signal("groups");
      navigate(`/group/${group.id}/about`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("createGroup.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("createGroup.title")}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorBox message={error} />}

        {/* Group name */}
        <Card>
          <CardBody className="space-y-4">
            <div>
              <Label>{t("createGroup.nameLabel")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("createGroup.namePlaceholder")} autoFocus />
            </div>

            <div>
              <Label>{t("createGroup.whoCanJoin")}</Label>
              <Select value={admissionMode} onChange={(e) => setAdmissionMode(e.target.value as "open" | "approval" | "invite-only")}>
                <option value="approval">{t("createGroup.admissionApproval")}</option>
                <option value="open">{t("createGroup.admissionOpen")}</option>
                <option value="invite-only">{t("createGroup.admissionInviteOnly")}</option>
              </Select>
              <p className="text-xs text-text-tertiary mt-1">
                {admissionMode === "approval" && t("createGroup.admissionApprovalDesc")}
                {admissionMode === "open" && t("createGroup.admissionOpenDesc")}
                {admissionMode === "invite-only" && t("createGroup.admissionInviteOnlyDesc")}
              </p>
              {admissionMode === "open" && (
                <p className="text-xs text-warning-text bg-warning-subtle border border-warning-border rounded px-2 py-1.5 mt-1.5">
                  {t("createGroup.sybilWarning")}
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Capabilities */}
        <div>
          <h2 className="text-sm font-bold text-text-tertiary uppercase tracking-widest mb-3">{t("createGroup.capabilities")}</h2>

          {/* Voting */}
          <CapabilityCard
            checked={votingEnabled}
            onChange={setVotingEnabled}
            label={t("createGroup.capVoting")}
            description={t("createGroup.capVotingDesc")}
          >
            {votingEnabled && (
              <div className="mt-3 pt-3 border-t border-border-subtle">
                <VotingConfigForm config={votingConfig} onChange={setVotingConfig} />
              </div>
            )}
          </CapabilityCard>

          {/* Scoring */}
          <CapabilityCard
            checked={scoringEnabled}
            onChange={setScoringEnabled}
            label={t("createGroup.capScoring")}
            description={t("createGroup.capScoringDesc")}
          />

          {/* Surveys */}
          <CapabilityCard
            checked={surveysEnabled}
            onChange={setSurveysEnabled}
            label={t("createGroup.capSurveys")}
            description={t("createGroup.capSurveysDesc")}
          />

        </div>

        {/* Website URL */}
        <Card>
          <CardBody>
            <Label>{t("createGroup.websiteLabel")}</Label>
            <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
            {!websiteUrl && (
              <p className="text-xs text-text-tertiary mt-1">
                {t("createGroup.websiteHelper")}{" "}
                <a href="https://uniweb.app/templates?category=organization" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                  {t("createGroup.browseTemplates")} →
                </a>
              </p>
            )}
          </CardBody>
        </Card>

        {/* Submit */}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>{t("common:cancel")}</Button>
          <Button type="submit" disabled={submitting || !name.trim() || (!votingEnabled && !scoringEnabled && !surveysEnabled)}>
            {submitting ? t("createGroup.creating") : t("createGroup.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Capability card ──────────────────────────────────────────────────────

function CapabilityCard({ checked, onChange, label, description, children }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={`mb-3 transition-colors ${checked ? "border-accent-muted" : ""}`}>
      <CardBody>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <span className="font-medium text-sm text-text-primary">{label}</span>
            <p className="text-xs text-text-muted mt-0.5">{description}</p>
          </div>
        </label>
        {children}
      </CardBody>
    </Card>
  );
}
