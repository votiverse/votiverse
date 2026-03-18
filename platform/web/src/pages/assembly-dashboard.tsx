import { useState, useCallback } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { GovernanceConfig } from "../api/types.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, StatusBadge, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import {
  presetLabel,
  humanizeVotingMethod,
  humanizeSecrecy,
  humanizeParticipation,
  humanizePredictions,
  humanizeAwareness,
  humanizeBoolean,
  humanizeResultsVisibility,
} from "../lib/presets.js";

export function AssemblyDashboard() {
  const { assemblyId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { data: assembly, loading, error, refetch } = useApi(() => api.getAssembly(assemblyId!), [assemblyId]);
  const { data: profile } = useApi(() => api.getAssemblyProfile(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: eventsData } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const { data: delegationsData } = useApi(
    () => participantId ? api.listDelegations(assemblyId!, participantId) : api.listDelegations(assemblyId!),
    [assemblyId, participantId],
  );
  const { data: historyData } = useApi(
    () => participantId ? api.getVotingHistory(assemblyId!, participantId) : Promise.resolve(null),
    [assemblyId, participantId],
  );
  const [showConfig, setShowConfig] = useState(true);

  if (loading) return <Spinner />;
  if (error || !assembly) return <ErrorBox message={error ?? "Assembly not found"} onRetry={refetch} />;

  const members = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const delegations = delegationsData?.delegations ?? [];

  const { config } = assembly;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{assembly.name}</h1>
          <StatusBadge status={assembly.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">{config.description}</p>
      </div>

      {/* Onboarding rules summary — shown once per assembly */}
      <WelcomeCard assemblyId={assemblyId!} assemblyName={assembly.name} config={config} />

      {/* Stats row — participant-centric */}
      <div className={`grid grid-cols-2 ${config.delegation.delegationMode !== "none" ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 sm:gap-4 mb-8`}>
        <StatCard label="Members" value={members.length} linkTo={`/assembly/${assemblyId}/members`} />
        <StatCard label="Votes" value={events.length} linkTo={`/assembly/${assemblyId}/events`} />
        {config.delegation.delegationMode !== "none" && (
          <StatCard
            label="Your Delegates"
            value={delegations.length}
            linkTo={`/assembly/${assemblyId}/delegations`}
          />
        )}
        <StatCard
          label="Your Votes"
          value={historyData?.history.length ?? 0}
        />
      </div>

      {/* Config summary — collapsible */}
      <div className="mb-4 sm:mb-6">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          aria-label="Toggle governance settings"
          aria-expanded={showConfig}
        >
          <svg className={`w-4 h-4 transition-transform ${showConfig ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          Governance Settings
          <span className="text-gray-400 font-normal">({presetLabel(config.name)})</span>
        </button>
        {showConfig && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mt-3">
            <Card>
              <CardHeader>
                <h2 className="font-medium text-gray-900">Configuration</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                <ConfigRow label="Decision Model" value={presetLabel(config.name)} />
                <ConfigRow label="Voting Method" value={humanizeVotingMethod(config.ballot.votingMethod)} />
                <ConfigRow label="Ballot Secrecy" value={humanizeSecrecy(config.ballot.secrecy)} />
                <ConfigRow label="Participation" value={humanizeParticipation(config.ballot.participationMode)} />
                <ConfigRow label="Results" value={humanizeResultsVisibility(config.ballot.resultsVisibility)} />
                <ConfigRow label="Quorum" value={`${(config.ballot.quorum * 100).toFixed(0)}%`} />
                <ConfigRow label="Vote Changes" value={config.ballot.allowVoteChange ? "Allowed" : "Final — no changes"} />
                <ConfigRow label="Delegation" value={
                  config.delegation.delegationMode === "none" ? "Disabled"
                    : config.delegation.delegationMode === "candidacy" ? "Declared candidates"
                    : "Open to any member"
                } />
                {config.delegation.delegationMode !== "none" && (
                  <>
                    <ConfigRow label="Topic-Scoped" value={humanizeBoolean(config.delegation.topicScoped)} />
                    <ConfigRow label="Transitive" value={humanizeBoolean(config.delegation.transitive)} />
                    {config.delegation.maxChainDepth !== null && (
                      <ConfigRow label="Max Chain Depth" value={String(config.delegation.maxChainDepth)} />
                    )}
                    {config.delegation.maxDelegatesPerParticipant !== null && (
                      <ConfigRow label="Max Delegates" value={String(config.delegation.maxDelegatesPerParticipant)} />
                    )}
                  </>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="font-medium text-gray-900">Timeline</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                <ConfigRow label="Deliberation" value={`${config.timeline.deliberationDays} day${config.timeline.deliberationDays !== 1 ? "s" : ""}`} />
                <ConfigRow label="Curation" value={config.timeline.curationDays > 0 ? `${config.timeline.curationDays} day${config.timeline.curationDays !== 1 ? "s" : ""}` : "None"} />
                <ConfigRow label="Voting" value={`${config.timeline.votingDays} day${config.timeline.votingDays !== 1 ? "s" : ""}`} />
                <div className="text-xs text-gray-400 pt-1">
                  Total: {config.timeline.deliberationDays + config.timeline.curationDays + config.timeline.votingDays} days per vote
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="font-medium text-gray-900">Features</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                <ConfigRow label="Predictions" value={humanizePredictions(config.features.predictions)} />
                <ConfigRow label="Surveys" value={humanizeBoolean(config.features.polls, "enabled-disabled")} />
                <ConfigRow label="Insights" value={humanizeAwareness(config.features.awarenessIntensity)} />
                <ConfigRow label="Community Notes" value={humanizeBoolean(config.features.communityNotes, "enabled-disabled")} />
                <ConfigRow label="Blockchain" value={humanizeBoolean(config.features.blockchainIntegrity, "enabled-disabled")} />
                <ConfigRow label="Concentration Alert" value={`${(config.thresholds.concentrationAlertThreshold * 100).toFixed(0)}%`} />
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      {/* Owners & Admins */}
      {profile && (profile.owners.length > 0 || profile.admins.length > 0) && (
        <Card className="mt-4 sm:mt-6">
          <CardHeader>
            <h2 className="font-medium text-gray-900">Leadership</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {profile.owners.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Owners</p>
                  <div className="flex flex-wrap gap-3">
                    {profile.owners.map((r) => (
                      <div key={r.participantId} className="flex items-center gap-2">
                        <Avatar name={r.name ?? "?"} size="xs" />
                        <span className="text-sm text-gray-700">{r.name ?? r.participantId.slice(0, 8)}</span>
                        <Badge color="blue">Owner</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.admins.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Admins</p>
                  <div className="flex flex-wrap gap-3">
                    {profile.admins.map((r) => (
                      <div key={r.participantId} className="flex items-center gap-2">
                        <Avatar name={r.name ?? "?"} size="xs" />
                        <span className="text-sm text-gray-700">{r.name ?? r.participantId.slice(0, 8)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Recent events */}
      {events.length > 0 && (
        <Card className="mt-4 sm:mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Recent Votes</h2>
              <Link to={`/assembly/${assemblyId}/events`} className="text-sm text-brand hover:text-brand-light">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-1">
              {events.slice(0, 5).map((evt) => (
                <Link
                  key={evt.id}
                  to={`/assembly/${assemblyId}/events/${evt.id}`}
                  className="flex items-center justify-between py-2.5 sm:py-2 px-3 rounded-md hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px] sm:min-h-0"
                >
                  <span className="text-sm text-gray-900">{evt.title}</span>
                  <Badge color="gray">{evt.issueIds?.length ?? 0} questions</Badge>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Members */}
      {members.length > 0 && (
        <Card className="mt-4 sm:mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Members</h2>
              <Link to={`/assembly/${assemblyId}/members`} className="text-sm text-brand hover:text-brand-light">
                View all {members.length}
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-3">
              {members.slice(0, 12).map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Avatar name={m.name} size="xs" />
                  <span className="text-sm text-gray-700">{m.name}</span>
                </div>
              ))}
              {members.length > 12 && (
                <span className="text-sm text-gray-400 self-center">+{members.length - 12} more</span>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, linkTo }: { label: string; value: string | number; linkTo?: string }) {
  const content = (
    <Card className={linkTo ? "hover:border-brand-200 active:border-brand transition-colors" : ""}>
      <CardBody className="text-center py-4 sm:py-6">
        <div className="text-2xl sm:text-3xl font-semibold text-gray-900">{value}</div>
        <div className="text-xs sm:text-sm text-gray-500 mt-1">{label}</div>
      </CardBody>
    </Card>
  );
  return linkTo ? <Link to={linkTo}>{content}</Link> : content;
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}

/** Generates plain-language governance rules from the config. */
function summarizeRules(config: GovernanceConfig): string[] {
  const rules: string[] = [];

  // Delegation
  if (config.delegation.delegationMode === "none") {
    rules.push("Every member votes directly on every question");
  } else if (config.delegation.delegationMode === "candidacy") {
    rules.push("Members can delegate their vote to trusted candidates" + (config.delegation.topicScoped ? " by topic" : ""));
  } else {
    rules.push("Members can delegate their vote to any other member" + (config.delegation.topicScoped ? " by topic" : ""));
  }

  // Timeline
  const tl = config.timeline;
  if (tl) {
    const parts = [`${tl.deliberationDays} day${tl.deliberationDays !== 1 ? "s" : ""} for deliberation`];
    if (tl.curationDays > 0) parts.push(`${tl.curationDays} day${tl.curationDays !== 1 ? "s" : ""} for curation`);
    parts.push(`${tl.votingDays} day${tl.votingDays !== 1 ? "s" : ""} to vote`);
    rules.push(parts.join(", then "));
  }

  // Ballot
  if (config.ballot.secrecy === "secret") {
    rules.push("Ballots are secret; results are revealed after voting ends");
  } else if (config.ballot.secrecy === "public") {
    rules.push("Ballots are public" + (config.ballot.resultsVisibility === "live" ? " with live results" : ""));
  }

  if (config.ballot.allowVoteChange) {
    rules.push("You can change your vote any time before voting closes");
  }

  // Features
  if (config.features.communityNotes) {
    rules.push("Community notes help verify claims in proposals and candidate profiles");
  }
  if (config.features.polls) {
    rules.push("Surveys capture member observations as evidence for accountability");
  }

  return rules;
}

function WelcomeCard({ assemblyId, assemblyName, config }: { assemblyId: string; assemblyName: string; config: GovernanceConfig }) {
  const storageKey = `votiverse:welcome-dismissed:${assemblyId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "1");

  const dismiss = useCallback(() => {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }, [storageKey]);

  if (dismissed) return null;

  const rules = summarizeRules(config);

  return (
    <Card className="mb-6 border-brand-200 bg-brand-50/30">
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Welcome to {assemblyName}</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">
              This group uses <span className="font-medium">{presetLabel(config.name)}</span> governance:
            </p>
            <ul className="space-y-1">
              {rules.map((rule, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="text-brand mt-0.5 shrink-0">-</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-2">These rules are permanent and apply to all votes in this group.</p>
          </div>
          <button
            onClick={dismiss}
            className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
