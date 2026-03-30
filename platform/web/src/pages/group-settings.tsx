import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useGroupRole } from "../hooks/use-group-role.js";
import { useGroup } from "../hooks/use-group.js";
import { signal } from "../hooks/use-mutation-signal.js";
import * as api from "../api/client.js";
import { Card, CardHeader, CardBody, Button, Input, Label, Select, Spinner, ErrorBox } from "../components/ui.js";
import { VotingConfigForm, QUADRANT_DEFAULTS, toGovernanceConfig } from "../components/voting-config-form.js";
import type { VotingConfig } from "../components/voting-config-form.js";
import type { AdmissionMode } from "../api/types.js";

export function GroupSettings() {
  const { t } = useTranslation("governance");
  const { groupId } = useParams();
  const location = useLocation();
  const { isAdmin, loading: roleLoading } = useGroupRole(groupId);
  const { group } = useGroup(groupId);
  const { data: settingsData, loading, refetch } = useApi(() => api.getGroupSettings(groupId!), [groupId]);

  // Scroll to hash section on mount
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }, [location.hash, loading]);

  if (loading || roleLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-xl font-bold text-text-primary mb-2">{t("settings.adminOnly")}</h1>
        <p className="text-text-muted">{t("settings.adminOnlyDesc")}</p>
      </div>
    );
  }

  const config = group?.config;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("settings.title")}</h1>

      {/* Section 1: Ballot */}
      <section id="ballot" className="mb-6">
        <BallotSection groupId={groupId!} config={config} onSaved={refetch} t={t} />
      </section>

      {/* Section 2: Timeline */}
      <section id="timeline" className="mb-6">
        <TimelineSection groupId={groupId!} config={config} onSaved={refetch} t={t} />
      </section>

      {/* Section 3: Delegation & Notes */}
      <section id="delegation" className="mb-6">
        <DelegationNotesSection groupId={groupId!} config={config} capabilities={group?.capabilities ?? []} onSaved={refetch} t={t} />
      </section>

      {/* Section 4: General */}
      <section id="general" className="mb-6">
        <GeneralSection groupId={groupId!} settings={settingsData} onSaved={refetch} t={t} />
      </section>
    </div>
  );
}

// ── Ballot Section ──────────────────────────────────────────────────────

function BallotSection({ groupId, config, onSaved, t }: {
  groupId: string;
  config: import("../api/types.js").GovernanceConfig | null | undefined;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  if (!config) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium text-text-primary">{t("settings.ballot")}</h2>
        <p className="text-xs text-text-muted mt-1">{t("settings.ballotDesc")}</p>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.secretBallot")}</span>
          <span className="text-text-primary font-medium">{config.ballot.secret ? t("settings.yes") : t("settings.no")}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.liveResults")}</span>
          <span className="text-text-primary font-medium">{config.ballot.liveResults ? t("settings.yes") : t("settings.no")}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.voteChanges")}</span>
          <span className="text-text-primary font-medium">{config.ballot.allowVoteChange ? t("settings.allowed") : t("settings.final")}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.quorum")}</span>
          <span className="text-text-primary font-medium">{(config.ballot.quorum * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.votingMethod")}</span>
          <span className="text-text-primary font-medium">{config.ballot.method === "supermajority" ? t("settings.supermajority") : t("settings.majority")}</span>
        </div>
        <p className="text-xs text-text-tertiary pt-1">{t("settings.ballotNote")}</p>
      </CardBody>
    </Card>
  );
}

// ── Timeline Section ────────────────────────────────────────────────────

function TimelineSection({ groupId, config, onSaved, t }: {
  groupId: string;
  config: import("../api/types.js").GovernanceConfig | null | undefined;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  if (!config) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium text-text-primary">{t("settings.timeline")}</h2>
        <p className="text-xs text-text-muted mt-1">{t("settings.timelineDesc")}</p>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.deliberation")}</span>
          <span className="text-text-primary font-medium">{config.timeline.deliberationDays} {t("settings.days")}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.curation")}</span>
          <span className="text-text-primary font-medium">{config.timeline.curationDays > 0 ? `${config.timeline.curationDays} ${t("settings.days")}` : t("settings.none")}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{t("settings.voting")}</span>
          <span className="text-text-primary font-medium">{config.timeline.votingDays} {t("settings.days")}</span>
        </div>
        <div className="text-xs text-text-tertiary pt-1">
          {t("settings.totalPerVote", { count: config.timeline.deliberationDays + config.timeline.curationDays + config.timeline.votingDays })}
        </div>
        <p className="text-xs text-text-tertiary">{t("settings.timelineNote")}</p>
      </CardBody>
    </Card>
  );
}

// ── Delegation & Capabilities Section ────────────────────────────────────

function DelegationNotesSection({ groupId, config, capabilities, onSaved, t }: {
  groupId: string;
  config: import("../api/types.js").GovernanceConfig | null | undefined;
  capabilities: string[];
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [caps, setCaps] = useState<string[]>(capabilities);
  const [showEnableVoting, setShowEnableVoting] = useState(false);

  const toggleCapability = async (cap: string) => {
    setToggling(cap);
    try {
      const enabled = caps.includes(cap);
      const result = enabled
        ? await api.disableCapability(groupId, cap)
        : await api.enableCapability(groupId, cap);
      setCaps(result.capabilities);
      signal("groups");
      onSaved();
    } catch {
      // silently fail
    } finally {
      setToggling(null);
    }
  };

  const votingEnabled = caps.includes("voting");

  return (
    <>
    <Card>
      <CardHeader>
        <h2 className="font-medium text-text-primary">{t("settings.delegationAndCapabilities")}</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        {/* Delegation — read-only (only shown when voting is enabled) */}
        {config && (
          <div>
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">{t("settings.delegation")}</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t("settings.delegationEnabled")}</span>
                <span className="text-text-primary font-medium">{config.delegation.transferable ? t("settings.yes") : t("settings.no")}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t("settings.candidates")}</span>
                <span className="text-text-primary font-medium">{config.delegation.candidacy ? t("settings.yes") : t("settings.no")}</span>
              </div>
            </div>
            <p className="text-xs text-warning-text mt-2">{t("settings.delegationPermanent")}</p>
          </div>
        )}

        {/* Capabilities */}
        <div className={config ? "pt-3 border-t border-border-subtle" : ""}>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">{t("settings.capabilities")}</h3>
          <div className="space-y-3">
            {/* Voting */}
            <div className="flex items-center justify-between">
              <div className="min-w-0 mr-3">
                <span className="text-sm text-text-secondary">{t("settings.capVoting")}</span>
                <p className="text-xs text-text-muted">{t("settings.capVotingDesc")}</p>
              </div>
              {votingEnabled ? (
                <span className="text-xs text-text-tertiary shrink-0">{t("settings.permanent")}</span>
              ) : (
                <Button size="sm" onClick={() => setShowEnableVoting(true)}>{t("settings.enable")}</Button>
              )}
            </div>
            {/* Scoring — toggleable */}
            <CapabilityToggle
              label={t("settings.capScoring")}
              description={t("settings.capScoringDesc")}
              enabled={caps.includes("scoring")}
              toggling={toggling === "scoring"}
              onToggle={() => toggleCapability("scoring")}
            />
            {/* Surveys — toggleable */}
            <CapabilityToggle
              label={t("settings.capSurveys")}
              description={t("settings.capSurveysDesc")}
              enabled={caps.includes("surveys")}
              toggling={toggling === "surveys"}
              onToggle={() => toggleCapability("surveys")}
            />
            {/* Community Notes — toggleable */}
            <CapabilityToggle
              label={t("settings.capNotes")}
              description={t("settings.capNotesDesc")}
              enabled={caps.includes("community_notes")}
              toggling={toggling === "community_notes"}
              onToggle={() => toggleCapability("community_notes")}
            />
          </div>
        </div>
      </CardBody>
    </Card>

    {/* Enable voting modal */}
    {showEnableVoting && (
      <EnableVotingModal
        groupId={groupId}
        onClose={() => setShowEnableVoting(false)}
        onEnabled={() => {
          setShowEnableVoting(false);
          signal("groups");
          onSaved();
          // Force reload to pick up new config
          window.location.reload();
        }}
        t={t}
      />
    )}
    </>
  );
}

function EnableVotingModal({ groupId, onClose, onEnabled, t }: {
  groupId: string;
  onClose: () => void;
  onEnabled: () => void;
  t: (key: string) => string;
}) {
  const [votingConfig, setVotingConfig] = useState<VotingConfig>(QUADRANT_DEFAULTS.liquid);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.enableCapability(groupId, "voting", {
        config: toGovernanceConfig(votingConfig),
      });
      onEnabled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to enable voting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Card className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <CardHeader>
          <h3 className="font-medium text-text-primary">{t("settings.enableVoting")}</h3>
          <p className="text-xs text-text-muted mt-1">{t("settings.enableVotingDesc")}</p>
        </CardHeader>
        <CardBody className="space-y-4">
          {error && <ErrorBox message={error} />}

          <VotingConfigForm config={votingConfig} onChange={setVotingConfig} />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>{t("common:cancel")}</Button>
            <Button onClick={handleEnable} disabled={saving}>
              {saving ? t("common:loading") : t("settings.enableVoting")}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CapabilityToggle({ label, description, enabled, toggling, onToggle }: {
  label: string;
  description: string;
  enabled: boolean;
  toggling?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0 mr-3">
        <span className="text-sm text-text-secondary">{label}</span>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={toggling}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${enabled ? "bg-accent-text" : "bg-border-default"} ${toggling ? "opacity-50" : ""}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

// ── General Section ─────────────────────────────────────────────────────

function GeneralSection({ groupId, settings, onSaved, t }: {
  groupId: string;
  settings: { admissionMode: string; websiteUrl: string | null; voteCreation: string } | undefined;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const [admissionMode, setAdmissionMode] = useState<AdmissionMode>((settings?.admissionMode as AdmissionMode) ?? "approval");
  const [websiteUrl, setWebsiteUrl] = useState(settings?.websiteUrl ?? "");
  const [voteCreation, setVoteCreation] = useState(settings?.voteCreation ?? "admin");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setAdmissionMode(settings.admissionMode as AdmissionMode);
      setWebsiteUrl(settings.websiteUrl ?? "");
      setVoteCreation(settings.voteCreation);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateGroupSettings(groupId, {
        admissionMode,
        websiteUrl: websiteUrl.trim() || undefined,
        voteCreation,
      });
      signal("groups");
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium text-text-primary">{t("settings.general")}</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        {error && <ErrorBox message={error} />}
        <div>
          <Label>{t("settings.whoCanJoin")}</Label>
          <Select value={admissionMode} onChange={(e) => setAdmissionMode(e.target.value as AdmissionMode)}>
            <option value="approval">{t("settings.admissionApproval")}</option>
            <option value="open">{t("settings.admissionOpen")}</option>
            <option value="invite-only">{t("settings.admissionInviteOnly")}</option>
          </Select>
        </div>
        <div>
          <Label>{t("settings.websiteUrl")}</Label>
          <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <Label>{t("settings.whoCanCreateVotes")}</Label>
          <Select value={voteCreation} onChange={(e) => setVoteCreation(e.target.value)}>
            <option value="admin">{t("settings.adminsOnly")}</option>
            <option value="members">{t("settings.anyMember")}</option>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common:loading") : t("common:save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
