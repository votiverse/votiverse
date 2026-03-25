import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { presetLabel } from "../lib/presets.js";

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

/** Full config shape for the customization modal. Matches GovernanceConfig sections. */
interface ConfigDraft {
  preset: string;
  delegation: {
    candidacy: boolean;
    transferable: boolean;
  };
  ballot: {
    secret: boolean;
    liveResults: boolean;
    allowVoteChange: boolean;
    quorum: number;
    method: "majority" | "supermajority";
  };
  features: {
    communityNotes: boolean;
    predictions: boolean;
    surveys: boolean;
  };
  timeline: {
    deliberationDays: number;
    curationDays: number;
    votingDays: number;
  };
}

const PRESET_CONFIGS: Record<string, ConfigDraft> = {
  LIQUID_DELEGATION: {
    preset: "LIQUID_DELEGATION",
    delegation: { candidacy: true, transferable: true },
    ballot: { secret: true, liveResults: false, allowVoteChange: true, quorum: 0.1, method: "majority" },
    features: { communityNotes: true, predictions: true, surveys: true },
    timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 },
  },
  DIRECT_DEMOCRACY: {
    preset: "DIRECT_DEMOCRACY",
    delegation: { candidacy: false, transferable: false },
    ballot: { secret: true, liveResults: false, allowVoteChange: true, quorum: 0, method: "majority" },
    features: { communityNotes: false, predictions: false, surveys: false },
    timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 },
  },
  SWISS_VOTATION: {
    preset: "SWISS_VOTATION",
    delegation: { candidacy: false, transferable: false },
    ballot: { secret: true, liveResults: false, allowVoteChange: true, quorum: 0.2, method: "majority" },
    features: { communityNotes: true, predictions: true, surveys: false },
    timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 },
  },
  LIQUID_OPEN: {
    preset: "LIQUID_OPEN",
    delegation: { candidacy: false, transferable: true },
    ballot: { secret: false, liveResults: true, allowVoteChange: true, quorum: 0.1, method: "majority" },
    features: { communityNotes: false, predictions: false, surveys: false },
    timeline: { deliberationDays: 5, curationDays: 0, votingDays: 5 },
  },
  REPRESENTATIVE: {
    preset: "REPRESENTATIVE",
    delegation: { candidacy: true, transferable: false },
    ballot: { secret: true, liveResults: false, allowVoteChange: true, quorum: 0.5, method: "majority" },
    features: { communityNotes: false, predictions: false, surveys: false },
    timeline: { deliberationDays: 3, curationDays: 0, votingDays: 3 },
  },
  CIVIC: {
    preset: "CIVIC",
    delegation: { candidacy: true, transferable: true },
    ballot: { secret: true, liveResults: false, allowVoteChange: true, quorum: 0.1, method: "majority" },
    features: { communityNotes: true, predictions: true, surveys: true },
    timeline: { deliberationDays: 14, curationDays: 3, votingDays: 14 },
  },
};

function getDefaultConfig(): ConfigDraft {
  return structuredClone(PRESET_CONFIGS["LIQUID_DELEGATION"]!);
}

// ── Assembly list page ───────────────────────────────────────────────

export function AssemblyList() {
  const { t } = useTranslation("governance");
  const { data: assemblies, loading, error, refetch } = useApi(() => api.listAssemblies());
  const { pendingByAssembly, assemblySummaries } = useAttention();
  const activeByAssembly = Object.fromEntries(assemblySummaries.map((s) => [s.assembly.id, s.activeEventCount]));
  const [creating, setCreating] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("assemblyList.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("assemblyList.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t("assemblyList.newGroup")}</Button>
      </div>

      {creating && <CreateAssemblyForm onClose={() => setCreating(false)} onCreated={refetch} />}

      {!assemblies || assemblies.length === 0 ? (
        <EmptyState
          title={t("assemblyList.noGroups")}
          description={t("assemblyList.noGroupsDesc")}
          action={!creating ? <Button onClick={() => setCreating(true)}>{t("assemblyList.newGroup")}</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {assemblies.map((asm) => (
            <Link key={asm.id} to={`/assembly/${asm.id}/events`} className="block">
              <Card className="hover:border-accent-muted hover:shadow transition-all">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AssemblyInitial name={asm.name} />
                      <div>
                        <h3 className="font-medium text-text-primary">{asm.name}</h3>
                        <p className="text-sm text-text-muted mt-0.5">{presetLabel(asm.config.name, t)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {(activeByAssembly[asm.id] ?? 0) > 0 && (
                        <Badge color="gray">{t("assemblyList.openVote", { count: activeByAssembly[asm.id] })}</Badge>
                      )}
                      {(pendingByAssembly[asm.id] ?? 0) > 0 && (
                        <Badge color="red">{t("assemblyList.needsYou", { count: pendingByAssembly[asm.id] })}</Badge>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create group form ────────────────────────────────────────────────

function CreateAssemblyForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
      // Send full config when customized, otherwise just the preset name
      const params: Parameters<typeof api.createAssembly>[0] = { name: name.trim(), admissionMode, websiteUrl: websiteUrl.trim() || undefined };
      if (isCustomized) {
        params.config = config;
      } else {
        params.preset = config.preset;
      }
      const assembly = await api.createAssembly(params);
      onCreated();
      onClose();
      // Navigate directly to the new group's dashboard
      navigate(`/assembly/${assembly.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("assemblyList.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-medium text-text-primary">{t("assemblyList.newGroupTitle")}</h3>
            {error && <ErrorBox message={error} />}

            <div>
              <Label>{t("assemblyList.nameLabel")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("assemblyList.namePlaceholder")} autoFocus />
            </div>

            {/* Governance summary — subtle, with customize link */}
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

            {/* Timeline inputs */}
            <div>
              <Label>{t("assemblyList.timelinePerVote")}</Label>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={1} max={90}
                    value={config.timeline.deliberationDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, deliberationDays: Number(e.target.value) } }))}
                    className="w-16"
                  />
                  <span className="text-xs text-text-muted">{t("assemblyList.deliberation")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={0} max={30}
                    value={config.timeline.curationDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, curationDays: Number(e.target.value) } }))}
                    className="w-16"
                  />
                  <span className="text-xs text-text-muted">{t("assemblyList.curation")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={1} max={90}
                    value={config.timeline.votingDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, votingDays: Number(e.target.value) } }))}
                    className="w-16"
                  />
                  <span className="text-xs text-text-muted">{t("assemblyList.voting")}</span>
                </div>
                <span className="text-xs text-text-tertiary">{t("assemblyList.days")}</span>
              </div>
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
              <Input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
              />
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
              <Button type="button" variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
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
        />
      )}
    </>
  );
}

// ── Configuration modal ──────────────────────────────────────────────

function ConfigModal({
  config,
  onChange,
  onClose,
}: {
  config: ConfigDraft;
  onChange: (c: ConfigDraft) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("governance");
  const [draft, setDraft] = useState<ConfigDraft>(() => structuredClone(config));

  const update = (section: "delegation" | "ballot" | "features", values: Record<string, unknown>) => {
    setDraft((prev) => ({ ...prev, [section]: { ...prev[section], ...values } }));
  };

  const applyPreset = (presetKey: string) => {
    const base = PRESET_CONFIGS[presetKey];
    if (base) setDraft(structuredClone(base));
  };

  const handleSave = () => {
    onChange(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] mt-[5vh] bg-surface-raised rounded-xl shadow-2xl flex flex-col overflow-hidden mx-4">

        {/* Header */}
        <div className="px-6 py-4 border-b bg-surface shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold font-display text-text-primary">{t("assemblyList.governanceRules")}</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {t("assemblyList.governanceRulesDesc")}
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-interactive-active">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">

          {/* Preset selector */}
          <div>
            <Label>{t("assemblyList.startFromPreset")}</Label>
            <PresetPicker
              value={draft.preset}
              onChange={(presetKey) => applyPreset(presetKey)}
            />
            <p className="text-xs text-text-tertiary mt-1">{t("assemblyList.presetResetsAll")}</p>
          </div>

          <hr className="border-border-default" />

          {/* Delegation */}
          <Section title={t("assemblyList.sectionDelegation")}>
            <Toggle label={t("assemblyList.declaredCandidates")} checked={draft.delegation.candidacy} onChange={(v) => update("delegation", { candidacy: v })} />
            <Toggle label={t("assemblyList.transferableAnyMember")} checked={draft.delegation.transferable} onChange={(v) => update("delegation", { transferable: v })} />
          </Section>

          {/* Ballot */}
          <Section title={t("assemblyList.sectionBallot")}>
            <Toggle label={t("assemblyList.secretBallot")} checked={draft.ballot.secret} onChange={(v) => update("ballot", { secret: v })} />
            <Toggle label={t("assemblyList.liveResultsToggle")} checked={draft.ballot.liveResults} onChange={(v) => update("ballot", { liveResults: v })} />
            <Toggle label={t("assemblyList.allowVoteChanges")} checked={draft.ballot.allowVoteChange} onChange={(v) => update("ballot", { allowVoteChange: v })} />
            <Row label={t("assemblyList.quorum")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={100} step={5}
                  value={Math.round(draft.ballot.quorum * 100)}
                  onChange={(e) => update("ballot", { quorum: Number(e.target.value) / 100 })}
                  className="w-20"
                />
                <span className="text-sm text-text-muted">%</span>
              </div>
            </Row>
            <Row label={t("assemblyList.votingMethodLabel")}>
              <Select value={draft.ballot.method} onChange={(e) => update("ballot", { method: e.target.value })}>
                <option value="majority">{t("assemblyList.majority")}</option>
                <option value="supermajority">{t("assemblyList.supermajority")}</option>
              </Select>
            </Row>
          </Section>

          {/* Features */}
          <Section title={t("assemblyList.sectionFeatures")}>
            <Toggle label={t("assemblyList.featureCommunityNotes")} checked={draft.features.communityNotes} onChange={(v) => update("features", { communityNotes: v })} />
            <Toggle label={t("assemblyList.featurePredictions")} checked={draft.features.predictions} onChange={(v) => update("features", { predictions: v })} />
            <Toggle label={t("assemblyList.featureSurveys")} checked={draft.features.surveys} onChange={(v) => update("features", { surveys: v })} />
          </Section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-surface shrink-0 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
          <Button onClick={handleSave}>{t("common:apply")}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Preset picker ────────────────────────────────────────────────────

function PresetPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const PRESETS = usePresets();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = PRESETS.find((p) => p.value === value) ?? PRESETS[0]!;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative mt-1" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left rounded-xl border border-border-strong px-3 py-2.5 hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-focus-ring transition-colors"
      >
        <span className="text-sm font-medium text-text-primary">{selected.label}</span>
        <p className="text-xs text-text-muted mt-0.5">{selected.desc}</p>
        <svg className="absolute right-3 top-3 w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-surface-raised rounded-xl border border-border-default shadow-lg max-h-[320px] overflow-y-auto">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => { onChange(p.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                p.value === value
                  ? "bg-accent-subtle border-l-2 border-accent"
                  : "hover:bg-interactive-hover border-l-2 border-transparent"
              }`}
            >
              <span className={`text-sm font-medium ${p.value === value ? "text-accent-text" : "text-text-primary"}`}>{p.label}</span>
              <p className="text-xs text-text-muted mt-0.5">{p.desc}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal helper components ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-secondary mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-text-secondary shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-text-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-surface-raised transition-transform shadow-sm ${
          checked ? "translate-x-6" : "translate-x-1"
        }`} />
      </button>
    </label>
  );
}

// ── Assembly icon ────────────────────────────────────────────────────

const INITIAL_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

function AssemblyInitial({ name }: { name: string }) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (
    <div className={`w-9 h-9 ${INITIAL_COLORS[hash % INITIAL_COLORS.length]} rounded-lg flex items-center justify-center shrink-0`}>
      <span className="text-text-on-accent font-semibold text-sm">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}
