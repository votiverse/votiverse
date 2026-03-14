import { useParams, Link } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, StatusBadge, Badge } from "../components/ui.js";

export function AssemblyDashboard() {
  const { assemblyId } = useParams();
  const { data: assembly, loading, error, refetch } = useApi(() => api.getAssembly(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: eventsData } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);
  const { data: delegationsData } = useApi(() => api.listDelegations(assemblyId!), [assemblyId]);

  if (loading) return <Spinner />;
  if (error || !assembly) return <ErrorBox message={error ?? "Assembly not found"} onRetry={refetch} />;

  const members = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const delegations = delegationsData?.delegations ?? [];

  const { config } = assembly;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{assembly.name}</h1>
          <StatusBadge status={assembly.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">{config.description}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Members" value={members.length} linkTo={`/assembly/${assemblyId}/members`} />
        <StatCard label="Events" value={events.length} linkTo={`/assembly/${assemblyId}/events`} />
        <StatCard label="Active Delegations" value={delegations.length} linkTo={`/assembly/${assemblyId}/delegations`} />
        <StatCard
          label="Quorum"
          value={`${(config.ballot.quorum * 100).toFixed(0)}%`}
        />
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="font-medium text-gray-900">Governance Configuration</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <ConfigRow label="Preset" value={config.name} />
            <ConfigRow label="Voting Method" value={config.ballot.votingMethod} />
            <ConfigRow label="Ballot Secrecy" value={config.ballot.secrecy} />
            <ConfigRow label="Participation" value={config.ballot.participationMode} />
            <ConfigRow label="Delegation" value={config.delegation.enabled ? "Enabled" : "Disabled"} />
            {config.delegation.enabled && (
              <>
                <ConfigRow label="Topic-Scoped" value={config.delegation.topicScoped ? "Yes" : "No"} />
                <ConfigRow label="Transitive" value={config.delegation.transitive ? "Yes" : "No"} />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-medium text-gray-900">Features</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <ConfigRow label="Predictions" value={config.features.predictions} />
            <ConfigRow label="Polls" value={config.features.polls ? "Enabled" : "Disabled"} />
            <ConfigRow label="Awareness" value={config.features.awarenessIntensity} />
            <ConfigRow label="Community Notes" value={config.features.communityNotes ? "Enabled" : "Disabled"} />
            <ConfigRow label="Blockchain Integrity" value={config.features.blockchainIntegrity ? "Enabled" : "Disabled"} />
            <ConfigRow label="Concentration Alert" value={`${(config.thresholds.concentrationAlertThreshold * 100).toFixed(0)}%`} />
          </CardBody>
        </Card>
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Recent Events</h2>
              <Link to={`/assembly/${assemblyId}/events`} className="text-sm text-brand hover:text-brand-light">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {events.slice(0, 5).map((evt) => (
                <Link
                  key={evt.id}
                  to={`/assembly/${assemblyId}/events/${evt.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-gray-900">{evt.title}</span>
                  <div className="flex items-center gap-2">
                    <Badge color="gray">{evt.issueIds?.length ?? 0} issues</Badge>
                  </div>
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
    <Card className={linkTo ? "hover:border-brand-200 transition-colors" : ""}>
      <CardBody className="text-center py-6">
        <div className="text-3xl font-semibold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500 mt-1">{label}</div>
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
