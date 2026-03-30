import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, ErrorBox } from "../components/ui.js";
import { signal } from "../hooks/use-mutation-signal.js";

// ── Preset definitions ───────────────────────────────────────────────

function usePresets() {
  const { t } = useTranslation("governance");
  return [
    { value: "LIQUID_DELEGATION", label: t("groupList.presetLiquidDelegation"), desc: t("groupList.presetLiquidDelegationDesc") },
    { value: "DIRECT_DEMOCRACY", label: t("groupList.presetDirectDemocracy"), desc: t("groupList.presetDirectDemocracyDesc") },
    { value: "SWISS_VOTATION", label: t("groupList.presetSwissVotation"), desc: t("groupList.presetSwissVotationDesc") },
    { value: "LIQUID_OPEN", label: t("groupList.presetLiquidOpen"), desc: t("groupList.presetLiquidOpenDesc") },
    { value: "REPRESENTATIVE", label: t("groupList.presetRepresentative"), desc: t("groupList.presetRepresentativeDesc") },
    { value: "CIVIC", label: t("groupList.presetCivic"), desc: t("groupList.presetCivicDesc") },
  ];
}

interface ConfigDraft {
  preset: string;
  delegation: { candidacy: boolean; transferable: boolean };
  ballot: { secret: boolean; liveResults: boolean; allowVoteChange: boolean };
  timeline: { deliberationDays: number; curationDays: number; votingDays: number };
}

const PRESET_CONFIGS: Record<string, ConfigDraft> = {
  LIQUID_DELEGATION: { preset: "LIQUID_DELEGATION", delegation: { candidacy: true, transferable: true }, ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 } },
  DIRECT_DEMOCRACY: { preset: "DIRECT_DEMOCRACY", delegation: { candidacy: false, transferable: false }, ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 } },
  SWISS_VOTATION: { preset: "SWISS_VOTATION", delegation: { candidacy: false, transferable: false }, ballot: { secret: true, liveResults: false, allowVoteChange: false }, timeline: { deliberationDays: 14, curationDays: 3, votingDays: 7 } },
  LIQUID_OPEN: { preset: "LIQUID_OPEN", delegation: { candidacy: false, transferable: true }, ballot: { secret: false, liveResults: true, allowVoteChange: true }, timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 } },
  REPRESENTATIVE: { preset: "REPRESENTATIVE", delegation: { candidacy: true, transferable: false }, ballot: { secret: true, liveResults: false, allowVoteChange: false }, timeline: { deliberationDays: 14, curationDays: 3, votingDays: 7 } },
  CIVIC: { preset: "CIVIC", delegation: { candidacy: false, transferable: true }, ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 14, curationDays: 3, votingDays: 7 } },
};

function getDefaultConfig(): ConfigDraft {
  return structuredClone(PRESET_CONFIGS["LIQUID_DELEGATION"]!);
}

// ── Page ─────────────────────────────────────────────────────────────

export function CreateGroup() {
  const { t } = useTranslation("governance");
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [config, setConfig] = useState<ConfigDraft>(getDefaultConfig);
  const [admissionMode, setAdmissionMode] = useState<"open" | "approval" | "invite-only">("approval");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);

  const isCustomized = config.preset !== "LIQUID_DELEGATION";
  const PRESETS = usePresets();
  const presetInfo = PRESETS.find((p) => p.value === config.preset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const params: Parameters<typeof api.createGroup>[0] = { name: name.trim(), admissionMode, websiteUrl: websiteUrl.trim() || undefined };
      if (isCustomized) {
        params.config = config;
      } else {
        params.preset = config.preset;
      }
      const group = await api.createGroup(params);
      signal("groups");
      navigate(`/group/${group.id}/members`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("groupList.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const totalDays = config.timeline.deliberationDays + config.timeline.curationDays + config.timeline.votingDays;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("createGroup.title")}</h1>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorBox message={error} />}

            <div>
              <Label>{t("groupList.nameLabel")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("groupList.namePlaceholder")} autoFocus />
            </div>

            {/* Governance summary */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">
                {t("groupList.governance")} <span className="font-medium text-text-secondary">{presetInfo?.label ?? t("groupList.presetLiquidDelegation")}</span>
                {isCustomized && <span className="text-warning-text ml-1">{t("groupList.customized")}</span>}
              </span>
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                className="text-accent-text hover:text-accent-text text-sm font-medium"
              >
                {t("groupList.customizeRules")}
              </button>
            </div>
            <p className="text-xs text-text-tertiary -mt-2">
              {t("groupList.rulesPermanent")}
            </p>

            {/* Timeline */}
            <div>
              <Label>{t("groupList.timelinePerVote")}</Label>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} max={90} value={config.timeline.deliberationDays} onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, deliberationDays: Number(e.target.value) } }))} className="w-16" />
                  <span className="text-xs text-text-muted">{t("groupList.deliberation")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={0} max={30} value={config.timeline.curationDays} onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, curationDays: Number(e.target.value) } }))} className="w-16" />
                  <span className="text-xs text-text-muted">{t("groupList.curation")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} max={90} value={config.timeline.votingDays} onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, votingDays: Number(e.target.value) } }))} className="w-16" />
                  <span className="text-xs text-text-muted">{t("groupList.voting")}</span>
                </div>
                <span className="text-xs text-text-tertiary">{t("groupList.days")}</span>
              </div>
              <p className="text-xs text-text-tertiary mt-1">{t("eventsList.timelineTotal", { total: totalDays })}</p>
            </div>

            {/* Admission mode */}
            <div>
              <Label>{t("groupList.whoCanJoin")}</Label>
              <Select value={admissionMode} onChange={(e) => setAdmissionMode(e.target.value as "open" | "approval" | "invite-only")}>
                <option value="approval">{t("groupList.admissionApproval")}</option>
                <option value="open">{t("groupList.admissionOpen")}</option>
                <option value="invite-only">{t("groupList.admissionInviteOnly")}</option>
              </Select>
              <p className="text-xs text-text-tertiary mt-1">
                {admissionMode === "approval" && t("groupList.admissionApprovalDesc")}
                {admissionMode === "open" && t("groupList.admissionOpenDesc")}
                {admissionMode === "invite-only" && t("groupList.admissionInviteOnlyDesc")}
              </p>
              {admissionMode === "open" && (
                <p className="text-xs text-warning-text bg-warning-subtle border border-warning-border rounded px-2 py-1.5 mt-1.5">
                  {t("groupList.sybilWarning")}
                </p>
              )}
              <p className="text-xs text-text-tertiary mt-1">{t("groupList.changeableNote")}</p>
            </div>

            {/* Website URL */}
            <div>
              <Label>{t("groupList.websiteLabel")}</Label>
              <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
              {!websiteUrl && (
                <p className="text-xs text-text-tertiary mt-1">
                  {t("groupList.websiteHelper")}{" "}
                  <a href="https://uniweb.app/templates?category=organization" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                    {t("groupList.browseTemplates")} →
                  </a>
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>{t("common:cancel")}</Button>
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? t("groupList.creating") : t("groupList.createGroup")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {showCustomize && (
        <ConfigModal
          config={config}
          onChange={setConfig}
          onClose={() => setShowCustomize(false)}
          presets={PRESETS}
          presetConfigs={PRESET_CONFIGS}
        />
      )}
    </div>
  );
}

// ── Config modal (extracted) ─────────────────────────────────────────

function ConfigModal({ config, onChange, onClose, presets, presetConfigs }: {
  config: ConfigDraft;
  onChange: (c: ConfigDraft) => void;
  onClose: () => void;
  presets: Array<{ value: string; label: string; desc: string }>;
  presetConfigs: Record<string, ConfigDraft>;
}) {
  const { t } = useTranslation("governance");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Card className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <CardBody className="space-y-4">
          <h3 className="font-medium text-text-primary">{t("groupList.governanceRules")}</h3>
          <p className="text-sm text-text-muted">{t("groupList.governanceRulesDesc")}</p>

          {/* Preset selector */}
          <div>
            <Label>{t("groupList.startFromPreset")}</Label>
            <p className="text-xs text-text-tertiary mb-2">{t("groupList.presetResetsAll")}</p>
            <Select value={config.preset} onChange={(e) => { const p = presetConfigs[e.target.value]; if (p) onChange(structuredClone(p)); }}>
              {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>

          {/* Delegation */}
          <div>
            <Label>{t("groupList.sectionDelegation")}</Label>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.delegation.candidacy} onChange={(e) => onChange({ ...config, delegation: { ...config.delegation, candidacy: e.target.checked } })} className="rounded" />
                {t("groupList.declaredCandidates")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.delegation.transferable} onChange={(e) => onChange({ ...config, delegation: { ...config.delegation, transferable: e.target.checked } })} className="rounded" />
                {t("groupList.transferableAnyMember")}
              </label>
            </div>
          </div>

          {/* Ballot */}
          <div>
            <Label>{t("groupList.sectionBallot")}</Label>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.ballot.secret} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, secret: e.target.checked } })} className="rounded" />
                {t("groupList.secretBallot")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.ballot.liveResults} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, liveResults: e.target.checked } })} className="rounded" />
                {t("groupList.liveResults")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.ballot.allowVoteChange} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, allowVoteChange: e.target.checked } })} className="rounded" />
                {t("groupList.allowVoteChange")}
              </label>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button onClick={onClose}>{t("groupList.done")}</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
