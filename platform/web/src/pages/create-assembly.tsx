import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, ErrorBox } from "../components/ui.js";

// ── Preset definitions ───────────────────────────────────────────────

function usePresets() {
  const { t } = useTranslation("governance");
  return [
    { value: "LIQUID_DELEGATION", label: t("assemblyList.presetLiquidDelegation"), desc: t("assemblyList.presetLiquidDelegationDesc") },
    { value: "DIRECT_DEMOCRACY", label: t("assemblyList.presetDirectDemocracy"), desc: t("assemblyList.presetDirectDemocracyDesc") },
    { value: "SWISS_VOTATION", label: t("assemblyList.presetSwissVotation"), desc: t("assemblyList.presetSwissVotationDesc") },
    { value: "LIQUID_OPEN", label: t("assemblyList.presetLiquidOpen"), desc: t("assemblyList.presetLiquidOpenDesc") },
    { value: "REPRESENTATIVE", label: t("assemblyList.presetRepresentative"), desc: t("assemblyList.presetRepresentativeDesc") },
    { value: "CIVIC", label: t("assemblyList.presetCivic"), desc: t("assemblyList.presetCivicDesc") },
  ];
}

interface ConfigDraft {
  preset: string;
  delegation: { candidacy: boolean; transferable: boolean };
  ballot: { secret: boolean; liveResults: boolean; allowVoteChange: boolean };
  features: { predictions: string; surveys: boolean; communityNotes: boolean };
  timeline: { deliberationDays: number; curationDays: number; votingDays: number };
}

const PRESET_CONFIGS: Record<string, ConfigDraft> = {
  LIQUID_DELEGATION: { preset: "LIQUID_DELEGATION", delegation: { candidacy: true, transferable: true }, ballot: { secret: true, liveResults: false, allowVoteChange: true }, features: { predictions: "opt-in", surveys: true, communityNotes: true }, timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 } },
  DIRECT_DEMOCRACY: { preset: "DIRECT_DEMOCRACY", delegation: { candidacy: false, transferable: false }, ballot: { secret: true, liveResults: false, allowVoteChange: true }, features: { predictions: "off", surveys: false, communityNotes: false }, timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 } },
  SWISS_VOTATION: { preset: "SWISS_VOTATION", delegation: { candidacy: false, transferable: false }, ballot: { secret: true, liveResults: false, allowVoteChange: false }, features: { predictions: "off", surveys: false, communityNotes: true }, timeline: { deliberationDays: 14, curationDays: 3, votingDays: 7 } },
  LIQUID_OPEN: { preset: "LIQUID_OPEN", delegation: { candidacy: false, transferable: true }, ballot: { secret: false, liveResults: true, allowVoteChange: true }, features: { predictions: "mandatory", surveys: false, communityNotes: true }, timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 } },
  REPRESENTATIVE: { preset: "REPRESENTATIVE", delegation: { candidacy: true, transferable: false }, ballot: { secret: true, liveResults: false, allowVoteChange: false }, features: { predictions: "opt-in", surveys: true, communityNotes: true }, timeline: { deliberationDays: 14, curationDays: 3, votingDays: 7 } },
  CIVIC: { preset: "CIVIC", delegation: { candidacy: false, transferable: true }, ballot: { secret: true, liveResults: false, allowVoteChange: true }, features: { predictions: "opt-in", surveys: true, communityNotes: true }, timeline: { deliberationDays: 14, curationDays: 3, votingDays: 7 } },
};

function getDefaultConfig(): ConfigDraft {
  return structuredClone(PRESET_CONFIGS["LIQUID_DELEGATION"]!);
}

// ── Page ─────────────────────────────────────────────────────────────

export function CreateAssembly() {
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
      const params: Parameters<typeof api.createAssembly>[0] = { name: name.trim(), admissionMode, websiteUrl: websiteUrl.trim() || undefined };
      if (isCustomized) {
        params.config = config;
      } else {
        params.preset = config.preset;
      }
      const assembly = await api.createAssembly(params);
      navigate(`/assembly/${assembly.id}/members`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("assemblyList.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const totalDays = config.timeline.deliberationDays + config.timeline.curationDays + config.timeline.votingDays;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("createAssembly.title")}</h1>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorBox message={error} />}

            <div>
              <Label>{t("assemblyList.nameLabel")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("assemblyList.namePlaceholder")} autoFocus />
            </div>

            {/* Governance summary */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">
                {t("assemblyList.governance")} <span className="font-medium text-text-secondary">{presetInfo?.label ?? t("assemblyList.presetLiquidDelegation")}</span>
                {isCustomized && <span className="text-warning-text ml-1">{t("assemblyList.customized")}</span>}
              </span>
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                className="text-accent-text hover:text-accent-text text-sm font-medium"
              >
                {t("assemblyList.customizeRules")}
              </button>
            </div>
            <p className="text-xs text-text-tertiary -mt-2">
              {t("assemblyList.rulesPermanent")}
            </p>

            {/* Timeline */}
            <div>
              <Label>{t("assemblyList.timelinePerVote")}</Label>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} max={90} value={config.timeline.deliberationDays} onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, deliberationDays: Number(e.target.value) } }))} className="w-16" />
                  <span className="text-xs text-text-muted">{t("assemblyList.deliberation")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={0} max={30} value={config.timeline.curationDays} onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, curationDays: Number(e.target.value) } }))} className="w-16" />
                  <span className="text-xs text-text-muted">{t("assemblyList.curation")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} max={90} value={config.timeline.votingDays} onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, votingDays: Number(e.target.value) } }))} className="w-16" />
                  <span className="text-xs text-text-muted">{t("assemblyList.voting")}</span>
                </div>
                <span className="text-xs text-text-tertiary">{t("assemblyList.days")}</span>
              </div>
              <p className="text-xs text-text-tertiary mt-1">{t("eventsList.timelineTotal", { total: totalDays })}</p>
            </div>

            {/* Admission mode */}
            <div>
              <Label>{t("assemblyList.whoCanJoin")}</Label>
              <Select value={admissionMode} onChange={(e) => setAdmissionMode(e.target.value as "open" | "approval" | "invite-only")}>
                <option value="approval">{t("assemblyList.admissionApproval")}</option>
                <option value="open">{t("assemblyList.admissionOpen")}</option>
                <option value="invite-only">{t("assemblyList.admissionInviteOnly")}</option>
              </Select>
              <p className="text-xs text-text-tertiary mt-1">
                {admissionMode === "approval" && t("assemblyList.admissionApprovalDesc")}
                {admissionMode === "open" && t("assemblyList.admissionOpenDesc")}
                {admissionMode === "invite-only" && t("assemblyList.admissionInviteOnlyDesc")}
              </p>
              {admissionMode === "open" && (
                <p className="text-xs text-warning-text bg-warning-subtle border border-warning-border rounded px-2 py-1.5 mt-1.5">
                  {t("assemblyList.sybilWarning")}
                </p>
              )}
              <p className="text-xs text-text-tertiary mt-1">{t("assemblyList.changeableNote")}</p>
            </div>

            {/* Website URL */}
            <div>
              <Label>{t("assemblyList.websiteLabel")}</Label>
              <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
              {!websiteUrl && (
                <p className="text-xs text-text-tertiary mt-1">
                  {t("assemblyList.websiteHelper")}{" "}
                  <a href="https://uniweb.app/templates?category=organization" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                    {t("assemblyList.browseTemplates")} →
                  </a>
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>{t("common:cancel")}</Button>
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? t("assemblyList.creating") : t("assemblyList.createGroup")}
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
          <h3 className="font-medium text-text-primary">{t("assemblyList.governanceRules")}</h3>
          <p className="text-sm text-text-muted">{t("assemblyList.governanceRulesDesc")}</p>

          {/* Preset selector */}
          <div>
            <Label>{t("assemblyList.startFromPreset")}</Label>
            <p className="text-xs text-text-tertiary mb-2">{t("assemblyList.presetResetsAll")}</p>
            <Select value={config.preset} onChange={(e) => { const p = presetConfigs[e.target.value]; if (p) onChange(structuredClone(p)); }}>
              {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>

          {/* Delegation */}
          <div>
            <Label>{t("assemblyList.sectionDelegation")}</Label>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.delegation.candidacy} onChange={(e) => onChange({ ...config, delegation: { ...config.delegation, candidacy: e.target.checked } })} className="rounded" />
                {t("assemblyList.declaredCandidates")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.delegation.transferable} onChange={(e) => onChange({ ...config, delegation: { ...config.delegation, transferable: e.target.checked } })} className="rounded" />
                {t("assemblyList.transferableAnyMember")}
              </label>
            </div>
          </div>

          {/* Ballot */}
          <div>
            <Label>{t("assemblyList.sectionBallot")}</Label>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.ballot.secret} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, secret: e.target.checked } })} className="rounded" />
                {t("assemblyList.secretBallot")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.ballot.liveResults} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, liveResults: e.target.checked } })} className="rounded" />
                {t("assemblyList.liveResults")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.ballot.allowVoteChange} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, allowVoteChange: e.target.checked } })} className="rounded" />
                {t("assemblyList.allowVoteChange")}
              </label>
            </div>
          </div>

          {/* Features */}
          <div>
            <Label>{t("assemblyList.sectionFeatures")}</Label>
            <div className="space-y-2 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary w-24">{t("assemblyList.predictions")}</span>
                <Select value={config.features.predictions} onChange={(e) => onChange({ ...config, features: { ...config.features, predictions: e.target.value } })} className="flex-1">
                  <option value="off">{t("assemblyList.predictionsOff")}</option>
                  <option value="opt-in">{t("assemblyList.predictionsOptIn")}</option>
                  <option value="mandatory">{t("assemblyList.predictionsMandatory")}</option>
                  <option value="encouraged">{t("assemblyList.predictionsEncouraged")}</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.features.surveys} onChange={(e) => onChange({ ...config, features: { ...config.features, surveys: e.target.checked } })} className="rounded" />
                {t("assemblyList.surveys")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={config.features.communityNotes} onChange={(e) => onChange({ ...config, features: { ...config.features, communityNotes: e.target.checked } })} className="rounded" />
                {t("assemblyList.communityNotes")}
              </label>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button onClick={onClose}>{t("assemblyList.done")}</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
