import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { presetLabel } from "../lib/presets.js";

// ── Preset definitions ───────────────────────────────────────────────

const PRESETS = [
  { value: "LIQUID_DELEGATION", label: "Liquid Delegation", desc: "The recommended default. Delegation, deliberation, and full accountability." },
  { value: "DIRECT_DEMOCRACY", label: "Direct Democracy", desc: "Everyone votes on everything. No delegation, no curation." },
  { value: "SWISS_VOTATION", label: "Swiss Votation", desc: "Direct vote with structured deliberation and community verification." },
  { value: "LIQUID_OPEN", label: "Liquid Open", desc: "Open delegation with public ballots and live results. For close-knit groups." },
  { value: "REPRESENTATIVE", label: "Representative", desc: "Appointed representatives through declared candidates." },
  { value: "CIVIC", label: "Civic", desc: "Longer timelines, full features. For municipalities and large organizations." },
];

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
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">My Groups</h1>
          <p className="mt-1 text-sm text-gray-500">Your communities and organizations</p>
        </div>
        <Button onClick={() => setCreating(true)}>New Group</Button>
      </div>

      {creating && <CreateAssemblyForm onClose={() => setCreating(false)} onCreated={refetch} />}

      {!assemblies || assemblies.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create your first group to start making decisions together."
          action={!creating ? <Button onClick={() => setCreating(true)}>New Group</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {assemblies.map((asm) => (
            <Link key={asm.id} to={`/assembly/${asm.id}/events`} className="block">
              <Card className="hover:border-brand-200 hover:shadow transition-all">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AssemblyInitial name={asm.name} />
                      <div>
                        <h3 className="font-medium text-gray-900">{asm.name}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{presetLabel(asm.config.name)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {(activeByAssembly[asm.id] ?? 0) > 0 && (
                        <Badge color="gray">{activeByAssembly[asm.id]} open vote{activeByAssembly[asm.id] !== 1 ? "s" : ""}</Badge>
                      )}
                      {(pendingByAssembly[asm.id] ?? 0) > 0 && (
                        <Badge color="red">{pendingByAssembly[asm.id]} need{pendingByAssembly[asm.id] === 1 ? "s" : ""} you</Badge>
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
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [config, setConfig] = useState<ConfigDraft>(getDefaultConfig);
  const [admissionMode, setAdmissionMode] = useState<"open" | "approval" | "invite-only">("approval");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);

  const isCustomized = config.preset !== "LIQUID_DELEGATION";
  const presetInfo = PRESETS.find((p) => p.value === config.preset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      // Send full config when customized, otherwise just the preset name
      const params: Parameters<typeof api.createAssembly>[0] = { name: name.trim(), admissionMode };
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
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-medium text-gray-900">New Group</h3>
            {error && <ErrorBox message={error} />}

            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" autoFocus />
            </div>

            {/* Governance summary — subtle, with customize link */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Governance: <span className="font-medium text-gray-700">{presetInfo?.label ?? "Liquid Delegation"}</span>
                {isCustomized && <span className="text-amber-600 ml-1">(customized)</span>}
              </span>
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                className="text-brand hover:text-brand-light text-sm font-medium"
              >
                Customize rules
              </button>
            </div>
            <p className="text-xs text-gray-400 -mt-2">
              Governance rules are permanent and apply to all votes in this group.
            </p>

            {/* Timeline inputs */}
            <div>
              <Label>Timeline per vote</Label>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={1} max={90}
                    value={config.timeline.deliberationDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, deliberationDays: Number(e.target.value) } }))}
                    className="w-16"
                  />
                  <span className="text-xs text-gray-500">deliberation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={0} max={30}
                    value={config.timeline.curationDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, curationDays: Number(e.target.value) } }))}
                    className="w-16"
                  />
                  <span className="text-xs text-gray-500">curation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min={1} max={90}
                    value={config.timeline.votingDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, timeline: { ...prev.timeline, votingDays: Number(e.target.value) } }))}
                    className="w-16"
                  />
                  <span className="text-xs text-gray-500">voting</span>
                </div>
                <span className="text-xs text-gray-400">days</span>
              </div>
            </div>

            {/* Admission mode */}
            <div>
              <Label>Who can join</Label>
              <Select value={admissionMode} onChange={(e) => setAdmissionMode(e.target.value as "open" | "approval" | "invite-only")}>
                <option value="approval">Approval required (recommended)</option>
                <option value="open">Open — anyone with a link joins immediately</option>
                <option value="invite-only">Invite only — admin sends directly</option>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {admissionMode === "approval" && "New members must be approved by an admin before they can vote."}
                {admissionMode === "open" && "Anyone with an invite link joins immediately. Higher risk of fake accounts."}
                {admissionMode === "invite-only" && "Members join only through direct invitation from an admin."}
              </p>
              {admissionMode === "open" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1.5">
                  Open groups are more susceptible to Sybil attacks — a bad actor could create multiple accounts to multiply their voting power.
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">You can change this later in group settings.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "Creating..." : "Create Group"}
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
      <div className="relative w-full max-w-2xl max-h-[90vh] mt-[5vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden mx-4">

        {/* Header */}
        <div className="px-6 py-4 border-b bg-gray-50 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Governance Rules</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                These settings are permanent once the group is created.
                Every member will see these rules and can trust they won't change.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
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
            <Label>Start from a preset</Label>
            <PresetPicker
              value={draft.preset}
              onChange={(presetKey) => applyPreset(presetKey)}
            />
            <p className="text-xs text-gray-400 mt-1">Selecting a preset resets all settings below.</p>
          </div>

          <hr className="border-gray-200" />

          {/* Delegation */}
          <Section title="Delegation">
            <Toggle label="Declared candidates" checked={draft.delegation.candidacy} onChange={(v) => update("delegation", { candidacy: v })} />
            <Toggle label="Transferable (any member)" checked={draft.delegation.transferable} onChange={(v) => update("delegation", { transferable: v })} />
          </Section>

          {/* Ballot */}
          <Section title="Ballot & Voting">
            <Toggle label="Secret ballot" checked={draft.ballot.secret} onChange={(v) => update("ballot", { secret: v })} />
            <Toggle label="Live results" checked={draft.ballot.liveResults} onChange={(v) => update("ballot", { liveResults: v })} />
            <Toggle label="Allow vote changes during voting" checked={draft.ballot.allowVoteChange} onChange={(v) => update("ballot", { allowVoteChange: v })} />
            <Row label="Quorum">
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={100} step={5}
                  value={Math.round(draft.ballot.quorum * 100)}
                  onChange={(e) => update("ballot", { quorum: Number(e.target.value) / 100 })}
                  className="w-20"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </Row>
            <Row label="Voting method">
              <Select value={draft.ballot.method} onChange={(e) => update("ballot", { method: e.target.value })}>
                <option value="majority">Majority</option>
                <option value="supermajority">Supermajority</option>
              </Select>
            </Row>
          </Section>

          {/* Features */}
          <Section title="Features">
            <Toggle label="Community notes" checked={draft.features.communityNotes} onChange={(v) => update("features", { communityNotes: v })} />
            <Toggle label="Predictions" checked={draft.features.predictions} onChange={(v) => update("features", { predictions: v })} />
            <Toggle label="Surveys" checked={draft.features.surveys} onChange={(v) => update("features", { surveys: v })} />
          </Section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 shrink-0 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Apply</Button>
        </div>
      </div>
    </div>
  );
}

// ── Preset picker ────────────────────────────────────────────────────

function PresetPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        className="w-full text-left rounded-lg border border-gray-300 px-3 py-2.5 hover:border-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-colors"
      >
        <span className="text-sm font-medium text-gray-900">{selected.label}</span>
        <p className="text-xs text-gray-500 mt-0.5">{selected.desc}</p>
        <svg className="absolute right-3 top-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-[320px] overflow-y-auto">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => { onChange(p.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                p.value === value
                  ? "bg-brand-50 border-l-2 border-brand"
                  : "hover:bg-gray-50 border-l-2 border-transparent"
              }`}
            >
              <span className={`text-sm font-medium ${p.value === value ? "text-brand" : "text-gray-900"}`}>{p.label}</span>
              <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
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
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-600 shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-gray-600">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-brand" : "bg-gray-300"
        }`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
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
      <span className="text-white font-semibold text-sm">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}
