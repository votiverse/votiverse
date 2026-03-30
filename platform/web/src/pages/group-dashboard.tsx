import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, Badge } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";
import { ExternalLink, Pencil } from "lucide-react";
import { useGroupRole } from "../hooks/use-group-role.js";
import {
  quadrantLabel,
  humanizeBoolean,
  isDelegationEnabled,
} from "../lib/presets.js";
import { OnboardingDialog, shouldShowOnboarding } from "../components/onboarding-dialog.js";

export function GroupDashboard() {
  const { t } = useTranslation("governance");
  const { groupId } = useParams();
  const { getParticipantId } = useIdentity();
  const { isAdmin } = useGroupRole(groupId);
  const participantId = groupId ? getParticipantId(groupId) : null;
  const { data: group, loading, error, refetch } = useApi(() => api.getGroup(groupId!), [groupId]);
  const { data: profile } = useApi(() => api.getGroupProfile(groupId!), [groupId]);
  const { data: participantsData } = useApi(() => api.listParticipants(groupId!), [groupId]);
  const { data: eventsData } = useApi(() => api.listEvents(groupId!), [groupId]);
  const { data: delegationsData } = useApi(
    () => participantId ? api.listDelegations(groupId!, participantId) : api.listDelegations(groupId!),
    [groupId, participantId],
  );
  const { data: historyData } = useApi(
    () => participantId ? api.getVotingHistory(groupId!, participantId) : Promise.resolve(null),
    [groupId, participantId],
  );
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Re-check onboarding when groupId changes (handles redirects from invite acceptance)
  useEffect(() => {
    if (groupId && shouldShowOnboarding(groupId)) {
      setShowOnboarding(true);
    }
  }, [groupId]);

  if (loading) return <Spinner />;
  if (error || !group) return <ErrorBox message={error ?? t("groupDashboard.groupNotFound")} onRetry={refetch} />;

  const members = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const delegations = delegationsData?.delegations ?? [];

  const { config } = group;

  return (
    <div className="max-w-4xl mx-auto">
      {showOnboarding && (
        <OnboardingDialog
          groupId={groupId!}
          groupName={group.name}
          config={config}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {group.websiteUrl && (
        <div className="mb-4">
          <a
            href={group.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent-text hover:underline inline-flex items-center gap-1"
          >
            {(() => { try { return new URL(group.websiteUrl).hostname; } catch { return group.websiteUrl; } })()}
            <ExternalLink size={13} />
          </a>
        </div>
      )}

      {/* Stats row — participant-centric */}
      <div className={`grid grid-cols-2 ${isDelegationEnabled(config) ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 sm:gap-4 mb-8`}>
        <StatCard label={t("groupDashboard.statMembers")} value={members.length} linkTo={`/group/${groupId}/members`} />
        <StatCard label={t("groupDashboard.statVotes")} value={events.length} linkTo={`/group/${groupId}/events`} />
        {isDelegationEnabled(config) && (
          <StatCard
            label={t("groupDashboard.statYourDelegates")}
            value={delegations.length}
            linkTo={`/group/${groupId}/delegations`}
          />
        )}
        <StatCard
          label={t("groupDashboard.statYourVotes")}
          value={historyData?.history.length ?? 0}
        />
      </div>

      {/* Governance settings — 3 boxes */}
      {config && (
        <div className="mb-4 sm:mb-6">
          <h2 className="text-sm font-bold text-text-tertiary uppercase tracking-widest mb-3">{t("groupDashboard.governanceSettings")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-text-primary text-sm">{t("groupDashboard.ballot")}</h3>
                  {isAdmin && (
                    <Link to={`/group/${groupId}/members`} className="text-text-tertiary hover:text-text-secondary">
                      <Pencil className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                <ConfigRow label={t("groupDashboard.ballot")} value={config.ballot.secret ? t("groupDashboard.secret") : t("groupDashboard.public")} />
                <ConfigRow label={t("groupDashboard.liveResults")} value={humanizeBoolean(config.ballot.liveResults, "yes-no", t)} />
                <ConfigRow label={t("groupDashboard.voteChanges")} value={config.ballot.allowVoteChange ? t("groupDashboard.voteChangeAllowed") : t("groupDashboard.voteChangeFinal")} />
                <ConfigRow label={t("groupDashboard.quorum")} value={`${(config.ballot.quorum * 100).toFixed(0)}%`} />
                <ConfigRow label={t("groupDashboard.votingMethod")} value={config.ballot.method === "supermajority" ? t("groupDashboard.supermajority") : t("groupDashboard.majority")} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-text-primary text-sm">{t("groupDashboard.timeline")}</h3>
                  {isAdmin && (
                    <Link to={`/group/${groupId}/members`} className="text-text-tertiary hover:text-text-secondary">
                      <Pencil className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                <ConfigRow label={t("groupDashboard.deliberation")} value={t("groupDashboard.day", { count: config.timeline.deliberationDays })} />
                <ConfigRow label={t("groupDashboard.curation")} value={config.timeline.curationDays > 0 ? t("groupDashboard.day", { count: config.timeline.curationDays }) : t("groupDashboard.curationNone")} />
                <ConfigRow label={t("groupDashboard.voting")} value={t("groupDashboard.day", { count: config.timeline.votingDays })} />
                <div className="text-xs text-text-tertiary pt-1">
                  {t("groupDashboard.totalDaysPerVote", { count: config.timeline.deliberationDays + config.timeline.curationDays + config.timeline.votingDays })}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-text-primary text-sm">{t("groupDashboard.delegationAndNotes")}</h3>
                  {isAdmin && (
                    <Link to={`/group/${groupId}/members`} className="text-text-tertiary hover:text-text-secondary">
                      <Pencil className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                <ConfigRow label={t("groupDashboard.delegation")} value={humanizeBoolean(config.delegation.transferable, "enabled-disabled", t)} />
                <ConfigRow label={t("groupDashboard.candidatesLabel")} value={humanizeBoolean(config.delegation.candidacy, "enabled-disabled", t)} />
                <ConfigRow label={t("groupDashboard.communityNotes")} value={humanizeBoolean(group?.capabilities?.includes("community_notes") ?? true, "enabled-disabled", t)} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* Owners & Admins */}
      {profile && (profile.owners.length > 0 || profile.admins.length > 0) && (
        <Card className="mt-4 sm:mt-6">
          <CardHeader>
            <h2 className="font-medium text-text-primary">{t("groupDashboard.leadership")}</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {profile.owners.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase tracking-wide mb-2">{t("groupDashboard.owners")}</p>
                  <div className="flex flex-wrap gap-3">
                    {profile.owners.map((r) => (
                      <div key={r.participantId} className="flex items-center gap-2">
                        <Avatar name={r.name ?? "?"} size="xs" />
                        <span className="text-sm text-text-secondary">{r.name ?? r.participantId.slice(0, 8)}</span>
                        <Badge color="blue">{t("groupDashboard.ownerBadge")}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.admins.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase tracking-wide mb-2">{t("groupDashboard.admins")}</p>
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
              <h2 className="font-medium text-text-primary">{t("groupDashboard.recentVotes")}</h2>
              <Link to={`/group/${groupId}/events`} className="text-sm text-accent-text hover:text-accent-text">
                {t("groupDashboard.viewAll")}
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-1">
              {events.slice(0, 5).map((evt) => (
                <Link
                  key={evt.id}
                  to={`/group/${groupId}/events/${evt.id}`}
                  className="flex items-center justify-between py-2.5 sm:py-2 px-3 rounded-md hover:bg-interactive-hover active:bg-interactive-active transition-colors min-h-[44px] sm:min-h-0"
                >
                  <span className="text-sm text-text-primary">{evt.title}</span>
                  <Badge color="gray">{t("groupDashboard.nQuestions", { count: evt.issueIds?.length ?? 0 })}</Badge>
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
              <h2 className="font-medium text-text-primary">{t("groupDashboard.members")}</h2>
              <Link to={`/group/${groupId}/members`} className="text-sm text-accent-text hover:text-accent-text">
                {t("groupDashboard.viewAllN", { count: members.length })}
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
                <span className="text-sm text-text-tertiary self-center">{t("groupDashboard.moreMembers", { count: members.length - 12 })}</span>
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

