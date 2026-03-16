import { useState } from "react";
import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, StatusBadge, Badge } from "../components/ui.js";
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
  const { participantId } = useIdentity();
  const { data: assembly, loading, error, refetch } = useApi(() => api.getAssembly(assemblyId!), [assemblyId]);
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
  const [showConfig, setShowConfig] = useState(false);

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

      {/* Stats row — participant-centric */}
      <div className={`grid grid-cols-2 ${config.delegation.enabled ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 sm:gap-4 mb-8`}>
        <StatCard label="Members" value={members.length} linkTo={`/assembly/${assemblyId}/members`} />
        <StatCard label="Votes" value={events.length} linkTo={`/assembly/${assemblyId}/events`} />
        {config.delegation.enabled && (
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
                <ConfigRow label="Delegation" value={humanizeBoolean(config.delegation.enabled, "enabled-disabled")} />
                {config.delegation.enabled && (
                  <>
                    <ConfigRow label="Topic-Scoped" value={humanizeBoolean(config.delegation.topicScoped)} />
                    <ConfigRow label="Transitive" value={humanizeBoolean(config.delegation.transitive)} />
                  </>
                )}
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
