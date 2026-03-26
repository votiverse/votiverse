import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { ExternalLink } from "lucide-react";
import {
  presetLabel,
  humanizeBoolean,
  isDelegationEnabled,
} from "../lib/presets.js";
import { OnboardingDialog, shouldShowOnboarding } from "../components/onboarding-dialog.js";

export function AssemblyDashboard() {
  const { t } = useTranslation("governance");
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
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Re-check onboarding when assemblyId changes (handles redirects from invite acceptance)
  useEffect(() => {
    if (assemblyId && shouldShowOnboarding(assemblyId)) {
      setShowOnboarding(true);
    }
  }, [assemblyId]);

  if (loading) return <Spinner />;
  if (error || !assembly) return <ErrorBox message={error ?? t("assemblyDashboard.assemblyNotFound")} onRetry={refetch} />;

  const members = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const delegations = delegationsData?.delegations ?? [];

  const { config } = assembly;

  return (
    <div className="max-w-4xl mx-auto">
      {showOnboarding && (
        <OnboardingDialog
          assemblyId={assemblyId!}
          assemblyName={assembly.name}
          config={config}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {assembly.websiteUrl && (
        <div className="mb-4">
          <a
            href={assembly.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent-text hover:underline inline-flex items-center gap-1"
          >
            {(() => { try { return new URL(assembly.websiteUrl).hostname; } catch { return assembly.websiteUrl; } })()}
            <ExternalLink size={13} />
          </a>
        </div>
      )}

      {/* Stats row — participant-centric */}
      <div className={`grid grid-cols-2 ${isDelegationEnabled(config) ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 sm:gap-4 mb-8`}>
        <StatCard label={t("assemblyDashboard.statMembers")} value={members.length} linkTo={`/assembly/${assemblyId}/members`} />
        <StatCard label={t("assemblyDashboard.statVotes")} value={events.length} linkTo={`/assembly/${assemblyId}/events`} />
        {isDelegationEnabled(config) && (
          <StatCard
            label={t("assemblyDashboard.statYourDelegates")}
            value={delegations.length}
            linkTo={`/assembly/${assemblyId}/delegations`}
          />
        )}
        <StatCard
          label={t("assemblyDashboard.statYourVotes")}
          value={historyData?.history.length ?? 0}
        />
      </div>

      {/* Config summary — collapsible */}
      <div className="mb-4 sm:mb-6">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-secondary"
          aria-label="Toggle governance settings"
          aria-expanded={showConfig}
        >
          <svg className={`w-4 h-4 transition-transform ${showConfig ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {t("assemblyDashboard.governanceSettings")}
          <span className="text-text-tertiary font-normal">({presetLabel(config.name, t)})</span>
        </button>
        {showConfig && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mt-3">
            <Card>
              <CardHeader>
                <h2 className="font-medium text-text-primary">{t("assemblyDashboard.configuration")}</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                <ConfigRow label={t("assemblyDashboard.decisionModel")} value={presetLabel(config.name, t)} />
                <ConfigRow label={t("assemblyDashboard.votingMethod")} value={config.ballot.method === "supermajority" ? t("assemblyDashboard.supermajority") : t("assemblyDashboard.majority")} />
                <ConfigRow label={t("assemblyDashboard.ballot")} value={config.ballot.secret ? t("assemblyDashboard.secret") : t("assemblyDashboard.public")} />
                <ConfigRow label={t("assemblyDashboard.liveResults")} value={humanizeBoolean(config.ballot.liveResults, "yes-no", t)} />
                <ConfigRow label={t("assemblyDashboard.quorum")} value={`${(config.ballot.quorum * 100).toFixed(0)}%`} />
                <ConfigRow label={t("assemblyDashboard.voteChanges")} value={config.ballot.allowVoteChange ? t("assemblyDashboard.voteChangeAllowed") : t("assemblyDashboard.voteChangeFinal")} />
                <ConfigRow label={t("assemblyDashboard.candidatesLabel")} value={humanizeBoolean(config.delegation.candidacy, "enabled-disabled", t)} />
                <ConfigRow label={t("assemblyDashboard.transferableLabel")} value={humanizeBoolean(config.delegation.transferable, "enabled-disabled", t)} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="font-medium text-text-primary">{t("assemblyDashboard.timeline")}</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                <ConfigRow label={t("assemblyDashboard.deliberation")} value={t("assemblyDashboard.day", { count: config.timeline.deliberationDays })} />
                <ConfigRow label={t("assemblyDashboard.curation")} value={config.timeline.curationDays > 0 ? t("assemblyDashboard.day", { count: config.timeline.curationDays }) : t("assemblyDashboard.curationNone")} />
                <ConfigRow label={t("assemblyDashboard.voting")} value={t("assemblyDashboard.day", { count: config.timeline.votingDays })} />
                <div className="text-xs text-text-tertiary pt-1">
                  {t("assemblyDashboard.totalDaysPerVote", { count: config.timeline.deliberationDays + config.timeline.curationDays + config.timeline.votingDays })}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="font-medium text-text-primary">{t("assemblyDashboard.features")}</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                <ConfigRow label={t("assemblyDashboard.communityNotes")} value={humanizeBoolean(config.features.communityNotes, "enabled-disabled", t)} />
                <ConfigRow label={t("assemblyDashboard.predictionsLabel")} value={humanizeBoolean(config.features.predictions, "enabled-disabled", t)} />
                <ConfigRow label={t("assemblyDashboard.surveysLabel")} value={humanizeBoolean(config.features.surveys, "enabled-disabled", t)} />
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      {/* Owners & Admins */}
      {profile && (profile.owners.length > 0 || profile.admins.length > 0) && (
        <Card className="mt-4 sm:mt-6">
          <CardHeader>
            <h2 className="font-medium text-text-primary">{t("assemblyDashboard.leadership")}</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {profile.owners.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase tracking-wide mb-2">{t("assemblyDashboard.owners")}</p>
                  <div className="flex flex-wrap gap-3">
                    {profile.owners.map((r) => (
                      <div key={r.participantId} className="flex items-center gap-2">
                        <Avatar name={r.name ?? "?"} size="xs" />
                        <span className="text-sm text-text-secondary">{r.name ?? r.participantId.slice(0, 8)}</span>
                        <Badge color="blue">{t("assemblyDashboard.ownerBadge")}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.admins.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase tracking-wide mb-2">{t("assemblyDashboard.admins")}</p>
                  <div className="flex flex-wrap gap-3">
                    {profile.admins.map((r) => (
                      <div key={r.participantId} className="flex items-center gap-2">
                        <Avatar name={r.name ?? "?"} size="xs" />
                        <span className="text-sm text-text-secondary">{r.name ?? r.participantId.slice(0, 8)}</span>
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
              <h2 className="font-medium text-text-primary">{t("assemblyDashboard.recentVotes")}</h2>
              <Link to={`/assembly/${assemblyId}/events`} className="text-sm text-accent-text hover:text-accent-text">
                {t("assemblyDashboard.viewAll")}
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-1">
              {events.slice(0, 5).map((evt) => (
                <Link
                  key={evt.id}
                  to={`/assembly/${assemblyId}/events/${evt.id}`}
                  className="flex items-center justify-between py-2.5 sm:py-2 px-3 rounded-md hover:bg-interactive-hover active:bg-interactive-active transition-colors min-h-[44px] sm:min-h-0"
                >
                  <span className="text-sm text-text-primary">{evt.title}</span>
                  <Badge color="gray">{t("assemblyDashboard.nQuestions", { count: evt.issueIds?.length ?? 0 })}</Badge>
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
              <h2 className="font-medium text-text-primary">{t("assemblyDashboard.members")}</h2>
              <Link to={`/assembly/${assemblyId}/members`} className="text-sm text-accent-text hover:text-accent-text">
                {t("assemblyDashboard.viewAllN", { count: members.length })}
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-3">
              {members.slice(0, 12).map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Avatar name={m.name} size="xs" />
                  <span className="text-sm text-text-secondary">{m.name}</span>
                </div>
              ))}
              {members.length > 12 && (
                <span className="text-sm text-text-tertiary self-center">{t("assemblyDashboard.moreMembers", { count: members.length - 12 })}</span>
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
    <Card className={linkTo ? "hover:border-accent-muted active:border-accent transition-colors" : ""}>
      <CardBody className="text-center py-4 sm:py-6">
        <div className="text-2xl sm:text-3xl font-semibold text-text-primary">{value}</div>
        <div className="text-xs sm:text-sm text-text-muted mt-1">{label}</div>
      </CardBody>
    </Card>
  );
  return linkTo ? <Link to={linkTo}>{content}</Link> : content;
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  );
}

