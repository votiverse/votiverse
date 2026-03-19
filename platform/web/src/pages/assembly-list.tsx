import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useAttention } from "../hooks/use-attention.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { presetLabel } from "../lib/presets.js";

// ── Preset definitions ───────────────────────────────────────────────

const PRESETS = [
  { value: "MODERN_DEMOCRACY", label: "Modern Democracy", desc: "The recommended starting point. Balances delegation, deliberation, and accountability." },
  { value: "TOWN_HALL", label: "Direct Democracy", desc: "Everyone votes on everything. No delegation, no curation." },
  { value: "SWISS_MODEL", label: "Swiss Votation", desc: "Like Direct Democracy, but with structured deliberation and community verification." },
  { value: "LIQUID_STANDARD", label: "Liquid Open", desc: "Anyone can delegate to anyone. Informal, for groups where members know each other." },
  { value: "LIQUID_ACCOUNTABLE", label: "Full Accountability", desc: "Like Modern Democracy, but with mandatory predictions and public ballots." },
  { value: "BOARD_PROXY", label: "Board Proxy", desc: "One delegate per member, non-transitive. For formal boards and committees." },
  { value: "CIVIC_PARTICIPATORY", label: "Civic Participatory", desc: "Longer timelines, chain depth limits, blockchain integrity. For municipalities." },
];

/** Full config shape for the customization modal. Matches GovernanceConfig sections. */
interface ConfigDraft {
  preset: string;
  delegation: {
    delegationMode: string;
    topicScoped: boolean;
    transitive: boolean;
    maxChainDepth: number | null;
    maxDelegatesPerParticipant: number | null;
  };
  ballot: {
    secrecy: string;
    votingMethod: string;
    quorum: number;
    resultsVisibility: string;
    allowVoteChange: boolean;
    participationMode: string;
  };
  features: {
    communityNotes: boolean;
    surveys: boolean;
    predictions: string;
  };
  timeline: {
    deliberationDays: number;
    curationDays: number;
    votingDays: number;
  };
}

const PRESET_CONFIGS: Record<string, ConfigDraft> = {
  MODERN_DEMOCRACY: {
    preset: "MODERN_DEMOCRACY",
    delegation: { delegationMode: "candidacy", topicScoped: true, transitive: true, maxChainDepth: null, maxDelegatesPerParticipant: null },
    ballot: { secrecy: "secret", votingMethod: "simple-majority", quorum: 0.1, resultsVisibility: "sealed", allowVoteChange: true, participationMode: "voluntary" },
    features: { communityNotes: true, surveys: true, predictions: "encouraged" },
    timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 },
  },
  TOWN_HALL: {
    preset: "TOWN_HALL",
    delegation: { delegationMode: "none", topicScoped: false, transitive: false, maxChainDepth: null, maxDelegatesPerParticipant: null },
    ballot: { secrecy: "secret", votingMethod: "simple-majority", quorum: 0, resultsVisibility: "sealed", allowVoteChange: true, participationMode: "voluntary" },
    features: { communityNotes: false, surveys: false, predictions: "disabled" },
    timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 },
  },
  SWISS_MODEL: {
    preset: "SWISS_MODEL",
    delegation: { delegationMode: "none", topicScoped: false, transitive: false, maxChainDepth: null, maxDelegatesPerParticipant: null },
    ballot: { secrecy: "secret", votingMethod: "simple-majority", quorum: 0.2, resultsVisibility: "sealed", allowVoteChange: true, participationMode: "voluntary" },
    features: { communityNotes: true, surveys: false, predictions: "encouraged" },
    timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 },
  },
  LIQUID_STANDARD: {
    preset: "LIQUID_STANDARD",
    delegation: { delegationMode: "open", topicScoped: true, transitive: true, maxChainDepth: null, maxDelegatesPerParticipant: null },
    ballot: { secrecy: "public", votingMethod: "simple-majority", quorum: 0.1, resultsVisibility: "live", allowVoteChange: false, participationMode: "voluntary" },
    features: { communityNotes: false, surveys: false, predictions: "optional" },
    timeline: { deliberationDays: 5, curationDays: 0, votingDays: 5 },
  },
  LIQUID_ACCOUNTABLE: {
    preset: "LIQUID_ACCOUNTABLE",
    delegation: { delegationMode: "candidacy", topicScoped: true, transitive: true, maxChainDepth: null, maxDelegatesPerParticipant: null },
    ballot: { secrecy: "public", votingMethod: "simple-majority", quorum: 0.1, resultsVisibility: "live", allowVoteChange: false, participationMode: "voluntary" },
    features: { communityNotes: true, surveys: true, predictions: "mandatory" },
    timeline: { deliberationDays: 7, curationDays: 3, votingDays: 7 },
  },
  BOARD_PROXY: {
    preset: "BOARD_PROXY",
    delegation: { delegationMode: "open", topicScoped: false, transitive: false, maxChainDepth: 1, maxDelegatesPerParticipant: 1 },
    ballot: { secrecy: "secret", votingMethod: "simple-majority", quorum: 0.5, resultsVisibility: "sealed", allowVoteChange: true, participationMode: "voluntary" },
    features: { communityNotes: false, surveys: false, predictions: "disabled" },
    timeline: { deliberationDays: 3, curationDays: 0, votingDays: 3 },
  },
  CIVIC_PARTICIPATORY: {
    preset: "CIVIC_PARTICIPATORY",
    delegation: { delegationMode: "open", topicScoped: true, transitive: true, maxChainDepth: 3, maxDelegatesPerParticipant: null },
    ballot: { secrecy: "anonymous-auditable", votingMethod: "simple-majority", quorum: 0.1, resultsVisibility: "sealed", allowVoteChange: true, participationMode: "voluntary" },
    features: { communityNotes: true, surveys: true, predictions: "mandatory" },
    timeline: { deliberationDays: 14, curationDays: 3, votingDays: 14 },
  },
};

function getDefaultConfig(): ConfigDraft {
  return structuredClone(PRESET_CONFIGS["MODERN_DEMOCRACY"]!);
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
  const [name, setName] = useState("");
  const [config, setConfig] = useState<ConfigDraft>(getDefaultConfig);
  const [admissionMode, setAdmissionMode] = useState<"open" | "approval" | "invite-only">("approval");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);

  const isCustomized = config.preset !== "MODERN_DEMOCRACY";
  const presetInfo = PRESETS.find((p) => p.value === config.preset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createAssembly({ name: name.trim(), preset: config.preset, admissionMode });
      onCreated();
      onClose();
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
                Governance: <span className="font-medium text-gray-700">{presetInfo?.label ?? "Modern Democracy"}</span>
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

  const update = (section: "delegation" | "ballot" | "features" | "timeline", values: Record<string, unknown>) => {
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
            <Row label="Mode">
              <Select value={draft.delegation.delegationMode} onChange={(e) => update("delegation", { delegationMode: e.target.value })}>
                <option value="candidacy">Declared candidates</option>
                <option value="open">Open to any member</option>
                <option value="none">Disabled (direct democracy)</option>
              </Select>
            </Row>
            {draft.delegation.delegationMode !== "none" && (
              <>
                <Toggle label="Topic-scoped delegation" checked={draft.delegation.topicScoped} onChange={(v) => update("delegation", { topicScoped: v })} />
                <Toggle label="Transitive chains" checked={draft.delegation.transitive} onChange={(v) => update("delegation", { transitive: v })} />
              </>
            )}
          </Section>

          {/* Ballot */}
          <Section title="Ballot & Voting">
            <Row label="Secrecy">
              <Select value={draft.ballot.secrecy} onChange={(e) => update("ballot", { secrecy: e.target.value })}>
                <option value="secret">Secret ballot</option>
                <option value="public">Public ballot</option>
                <option value="anonymous-auditable">Anonymous (auditable)</option>
              </Select>
            </Row>
            <Row label="Voting method">
              <Select value={draft.ballot.votingMethod} onChange={(e) => update("ballot", { votingMethod: e.target.value })}>
                <option value="simple-majority">Simple majority</option>
                <option value="supermajority">Supermajority</option>
              </Select>
            </Row>
            <Row label="Results visibility">
              <Select value={draft.ballot.resultsVisibility} onChange={(e) => update("ballot", { resultsVisibility: e.target.value })}>
                <option value="sealed">After voting ends</option>
                <option value="live">Live (real-time)</option>
              </Select>
            </Row>
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
            <Toggle label="Allow vote changes during voting" checked={draft.ballot.allowVoteChange} onChange={(v) => update("ballot", { allowVoteChange: v })} />
          </Section>

          {/* Timeline */}
          <Section title="Timeline">
            <Row label="Deliberation">
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={90}
                  value={draft.timeline.deliberationDays}
                  onChange={(e) => update("timeline", { deliberationDays: Number(e.target.value) })}
                  className="w-20"
                />
                <span className="text-sm text-gray-500">days</span>
              </div>
            </Row>
            <Row label="Curation">
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={30}
                  value={draft.timeline.curationDays}
                  onChange={(e) => update("timeline", { curationDays: Number(e.target.value) })}
                  className="w-20"
                />
                <span className="text-sm text-gray-500">days</span>
                {draft.timeline.curationDays === 0 && <span className="text-xs text-gray-400">(no curation phase)</span>}
              </div>
            </Row>
            <Row label="Voting">
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={90}
                  value={draft.timeline.votingDays}
                  onChange={(e) => update("timeline", { votingDays: Number(e.target.value) })}
                  className="w-20"
                />
                <span className="text-sm text-gray-500">days</span>
              </div>
            </Row>
            <p className="text-xs text-gray-400">
              Total: {draft.timeline.deliberationDays + draft.timeline.curationDays + draft.timeline.votingDays} days per vote
            </p>
          </Section>

          {/* Features */}
          <Section title="Features">
            <Toggle label="Community notes" checked={draft.features.communityNotes} onChange={(v) => update("features", { communityNotes: v })} />
            <Toggle label="Surveys" checked={draft.features.surveys} onChange={(v) => update("features", { surveys: v })} />
            <Row label="Predictions">
              <Select value={draft.features.predictions} onChange={(e) => update("features", { predictions: e.target.value })}>
                <option value="disabled">Disabled</option>
                <option value="optional">Optional</option>
                <option value="encouraged">Encouraged</option>
                <option value="mandatory">Mandatory</option>
              </Select>
            </Row>
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
