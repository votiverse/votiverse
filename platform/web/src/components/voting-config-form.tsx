/**
 * Shared voting configuration form — used by both the create-group page
 * and the enable-voting modal in group settings.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "./ui.js";

// ── Types (exported for consumers) ──────────────────────────────────────

export type Quadrant = "direct" | "open" | "proxy" | "liquid";

export interface VotingConfig {
  quadrant: Quadrant;
  ballot: { secret: boolean; liveResults: boolean; allowVoteChange: boolean };
  timeline: { deliberationDays: number; curationDays: number; votingDays: number };
}

export const QUADRANT_DELEGATION: Record<Quadrant, { candidacy: boolean; transferable: boolean }> = {
  direct: { candidacy: false, transferable: false },
  open: { candidacy: false, transferable: true },
  proxy: { candidacy: true, transferable: false },
  liquid: { candidacy: true, transferable: true },
};

export const QUADRANT_DEFAULTS: Record<Quadrant, VotingConfig> = {
  direct: { quadrant: "direct", ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 } },
  open: { quadrant: "open", ballot: { secret: false, liveResults: true, allowVoteChange: true }, timeline: { deliberationDays: 5, curationDays: 0, votingDays: 5 } },
  proxy: { quadrant: "proxy", ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 3, curationDays: 0, votingDays: 3 } },
  liquid: { quadrant: "liquid", ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 } },
};

/** Build a GovernanceConfig object from VotingConfig. */
export function toGovernanceConfig(vc: VotingConfig) {
  return {
    delegation: QUADRANT_DELEGATION[vc.quadrant],
    ballot: { ...vc.ballot, quorum: 0.1, method: "majority" as const },
    timeline: vc.timeline,
  };
}

// ── Form component ──────────────────────────────────────────────────────

export function VotingConfigForm({ config, onChange }: {
  config: VotingConfig;
  onChange: (c: VotingConfig) => void;
}) {
  const { t } = useTranslation("governance");
  const [showBallot, setShowBallot] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showDelegation, setShowDelegation] = useState(true);

  const setQuadrant = (q: Quadrant) => onChange({ ...QUADRANT_DEFAULTS[q] });

  return (
    <div className="space-y-3">
      {/* Ballot settings */}
      <Collapsible label={t("createGroup.ballotSettings")} open={showBallot} onToggle={() => setShowBallot(!showBallot)}>
        <div className="space-y-2 pl-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={config.ballot.secret} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, secret: e.target.checked } })} className="rounded" />
            {t("createGroup.secretBallot")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={config.ballot.liveResults} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, liveResults: e.target.checked } })} className="rounded" />
            {t("createGroup.liveResults")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={config.ballot.allowVoteChange} onChange={(e) => onChange({ ...config, ballot: { ...config.ballot, allowVoteChange: e.target.checked } })} className="rounded" />
            {t("createGroup.allowVoteChange")}
          </label>
        </div>
      </Collapsible>

      {/* Timeline defaults */}
      <Collapsible label={t("createGroup.timelineDefaults")} open={showTimeline} onToggle={() => setShowTimeline(!showTimeline)}>
        <div className="flex items-center gap-4 pl-4">
          <TimelineInput label={t("createGroup.deliberation")} value={config.timeline.deliberationDays} min={1} onChange={(v) => onChange({ ...config, timeline: { ...config.timeline, deliberationDays: v } })} />
          <TimelineInput label={t("createGroup.curation")} value={config.timeline.curationDays} min={0} onChange={(v) => onChange({ ...config, timeline: { ...config.timeline, curationDays: v } })} />
          <TimelineInput label={t("createGroup.votingDays")} value={config.timeline.votingDays} min={1} onChange={(v) => onChange({ ...config, timeline: { ...config.timeline, votingDays: v } })} />
        </div>
      </Collapsible>

      {/* Delegation model */}
      <Collapsible label={t("createGroup.delegationModel")} open={showDelegation} onToggle={() => setShowDelegation(!showDelegation)}>
        <div className="pl-4 space-y-2">
          <p className="text-xs text-warning-text">{t("createGroup.delegationPermanent")}</p>
          <div className="grid grid-cols-2 gap-2">
            <QuadrantOption quadrant="direct" current={config.quadrant} onSelect={setQuadrant} t={t} />
            <QuadrantOption quadrant="proxy" current={config.quadrant} onSelect={setQuadrant} t={t} />
            <QuadrantOption quadrant="open" current={config.quadrant} onSelect={setQuadrant} t={t} />
            <QuadrantOption quadrant="liquid" current={config.quadrant} onSelect={setQuadrant} t={t} />
          </div>
        </div>
      </Collapsible>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function Collapsible({ label, open, onToggle, children }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button type="button" onClick={onToggle} className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-secondary">
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        {label}
      </button>
      {open && children}
    </>
  );
}

function QuadrantOption({ quadrant, current, onSelect, t }: {
  quadrant: Quadrant;
  current: Quadrant;
  onSelect: (q: Quadrant) => void;
  t: (key: string) => string;
}) {
  const selected = quadrant === current;
  const labels: Record<Quadrant, { name: string; desc: string }> = {
    direct: { name: t("createGroup.quadrantDirect"), desc: t("createGroup.quadrantDirectDesc") },
    open: { name: t("createGroup.quadrantOpen"), desc: t("createGroup.quadrantOpenDesc") },
    proxy: { name: t("createGroup.quadrantProxy"), desc: t("createGroup.quadrantProxyDesc") },
    liquid: { name: t("createGroup.quadrantLiquid"), desc: t("createGroup.quadrantLiquidDesc") },
  };
  const { name, desc } = labels[quadrant];

  return (
    <button
      type="button"
      onClick={() => onSelect(quadrant)}
      className={`text-left p-2.5 rounded-lg border transition-all ${
        selected
          ? "border-accent-muted bg-accent-subtle ring-1 ring-accent-muted"
          : "border-border-subtle hover:border-border-default"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${selected ? "border-accent-text" : "border-border-default"}`}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-accent-text" />}
        </div>
        <span className="text-sm font-medium text-text-primary">{name}</span>
      </div>
      <p className="text-xs text-text-muted mt-1 ml-5.5">{desc}</p>
    </button>
  );
}

function TimelineInput({ label, value, min, onChange }: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input type="number" min={min} max={90} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-16" />
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}
