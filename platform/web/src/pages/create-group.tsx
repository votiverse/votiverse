import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Input, Label, Select, ErrorBox } from "../components/ui.js";
import { signal } from "../hooks/use-mutation-signal.js";

// ── Types ───────────────────────────────────────────────────────────────

type Quadrant = "direct" | "open" | "proxy" | "liquid";

interface VotingConfig {
  quadrant: Quadrant;
  ballot: { secret: boolean; liveResults: boolean; allowVoteChange: boolean };
  timeline: { deliberationDays: number; curationDays: number; votingDays: number };
}

const QUADRANT_DELEGATION: Record<Quadrant, { candidacy: boolean; transferable: boolean }> = {
  direct: { candidacy: false, transferable: false },
  open: { candidacy: false, transferable: true },
  proxy: { candidacy: true, transferable: false },
  liquid: { candidacy: true, transferable: true },
};

const QUADRANT_DEFAULTS: Record<Quadrant, VotingConfig> = {
  direct: { quadrant: "direct", ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 7, curationDays: 0, votingDays: 7 } },
  open: { quadrant: "open", ballot: { secret: false, liveResults: true, allowVoteChange: true }, timeline: { deliberationDays: 5, curationDays: 0, votingDays: 5 } },
  proxy: { quadrant: "proxy", ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 3, curationDays: 0, votingDays: 3 } },
  liquid: { quadrant: "liquid", ballot: { secret: true, liveResults: false, allowVoteChange: true }, timeline: { deliberationDays: 7, curationDays: 2, votingDays: 7 } },
};

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
  const [showBallotSettings, setShowBallotSettings] = useState(false);
  const [showTimelineSettings, setShowTimelineSettings] = useState(false);
  const [showDelegationModel, setShowDelegationModel] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQuadrant = (q: Quadrant) => {
    setVotingConfig({ ...QUADRANT_DEFAULTS[q] });
  };

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
        params.config = {
          delegation: QUADRANT_DELEGATION[votingConfig.quadrant],
          ballot: { ...votingConfig.ballot, quorum: 0.1, method: "majority" },
          timeline: votingConfig.timeline,
        };
      }

      const group = await api.createGroup(params);
      signal("groups");
      navigate(`/group/${group.id}/members`);
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
              <div className="mt-3 pt-3 border-t border-border-subtle space-y-3">
                {/* Expandable ballot settings */}
                <button type="button" onClick={() => setShowBallotSettings(!showBallotSettings)} className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-secondary">
                  <svg className={`w-3 h-3 transition-transform ${showBallotSettings ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  {t("createGroup.ballotSettings")}
                </button>
                {showBallotSettings && (
                  <div className="space-y-2 pl-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={votingConfig.ballot.secret} onChange={(e) => setVotingConfig((p) => ({ ...p, ballot: { ...p.ballot, secret: e.target.checked } }))} className="rounded" />
                      {t("createGroup.secretBallot")}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={votingConfig.ballot.liveResults} onChange={(e) => setVotingConfig((p) => ({ ...p, ballot: { ...p.ballot, liveResults: e.target.checked } }))} className="rounded" />
                      {t("createGroup.liveResults")}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={votingConfig.ballot.allowVoteChange} onChange={(e) => setVotingConfig((p) => ({ ...p, ballot: { ...p.ballot, allowVoteChange: e.target.checked } }))} className="rounded" />
                      {t("createGroup.allowVoteChange")}
                    </label>
                  </div>
                )}

                {/* Expandable timeline settings */}
                <button type="button" onClick={() => setShowTimelineSettings(!showTimelineSettings)} className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-secondary">
                  <svg className={`w-3 h-3 transition-transform ${showTimelineSettings ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  {t("createGroup.timelineDefaults")}
                </button>
                {showTimelineSettings && (
                  <div className="flex items-center gap-4 pl-4">
                    <TimelineInput label={t("createGroup.deliberation")} value={votingConfig.timeline.deliberationDays} min={1} onChange={(v) => setVotingConfig((p) => ({ ...p, timeline: { ...p.timeline, deliberationDays: v } }))} />
                    <TimelineInput label={t("createGroup.curation")} value={votingConfig.timeline.curationDays} min={0} onChange={(v) => setVotingConfig((p) => ({ ...p, timeline: { ...p.timeline, curationDays: v } }))} />
                    <TimelineInput label={t("createGroup.votingDays")} value={votingConfig.timeline.votingDays} min={1} onChange={(v) => setVotingConfig((p) => ({ ...p, timeline: { ...p.timeline, votingDays: v } }))} />
                  </div>
                )}

                {/* Expandable delegation model */}
                <button type="button" onClick={() => setShowDelegationModel(!showDelegationModel)} className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-secondary">
                  <svg className={`w-3 h-3 transition-transform ${showDelegationModel ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  {t("createGroup.delegationModel")}
                </button>
                {showDelegationModel && (
                  <div className="pl-4 space-y-2">
                    <p className="text-xs text-warning-text">{t("createGroup.delegationPermanent")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <QuadrantOption quadrant="direct" current={votingConfig.quadrant} onSelect={setQuadrant} t={t} />
                      <QuadrantOption quadrant="proxy" current={votingConfig.quadrant} onSelect={setQuadrant} t={t} />
                      <QuadrantOption quadrant="open" current={votingConfig.quadrant} onSelect={setQuadrant} t={t} />
                      <QuadrantOption quadrant="liquid" current={votingConfig.quadrant} onSelect={setQuadrant} t={t} />
                    </div>
                  </div>
                )}
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

// ── Quadrant option ──────────────────────────────────────────────────────

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

// ── Timeline input ───────────────────────────────────────────────────────

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
