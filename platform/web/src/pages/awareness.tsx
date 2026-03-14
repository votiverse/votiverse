import { useState } from "react";
import { useParams } from "react-router";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { ConcentrationMetrics, VotingHistory, DelegateProfile } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Select, Label, Spinner, ErrorBox } from "../components/ui.js";

export function Awareness() {
  const { assemblyId } = useParams();
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: eventsData } = useApi(() => api.listEvents(assemblyId!), [assemblyId]);

  const participants = participantsData?.participants ?? [];
  const events = eventsData?.events ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));

  const allIssues = events.flatMap((evt) =>
    (evt.issueIds ?? []).map((id) => ({ id, eventTitle: evt.title })),
  );

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Awareness</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConcentrationPanel assemblyId={assemblyId!} issues={allIssues} nameMap={nameMap} />
        <ProfilePanel assemblyId={assemblyId!} participants={participants} nameMap={nameMap} />
        <HistoryPanel assemblyId={assemblyId!} participants={participants} />
      </div>
    </div>
  );
}

function ConcentrationPanel({
  assemblyId,
  issues,
  nameMap,
}: {
  assemblyId: string;
  issues: Array<{ id: string; eventTitle: string }>;
  nameMap: Map<string, string>;
}) {
  const [selectedIssue, setSelectedIssue] = useState("");
  const [metrics, setMetrics] = useState<ConcentrationMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    if (!selectedIssue) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getConcentration(assemblyId, selectedIssue);
      setMetrics(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium text-gray-900">Concentration Metrics</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          Measures how concentrated voting power is for a given issue.
        </p>
        <div>
          <Label>Issue</Label>
          <Select value={selectedIssue} onChange={(e) => setSelectedIssue(e.target.value)}>
            <option value="">Select an issue...</option>
            {issues.map((issue) => (
              <option key={issue.id} value={issue.id}>
                {issue.id.slice(0, 8)}... ({issue.eventTitle})
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={loadMetrics} disabled={!selectedIssue || loading}>
          {loading ? "Loading..." : "Load Metrics"}
        </Button>
        {error && <ErrorBox message={error} />}
        {metrics && (
          <div className="space-y-3">
            <MetricRow label="Gini Coefficient" value={metrics.giniCoefficient.toFixed(3)} />
            <MetricRow label="Max Weight" value={metrics.maxWeight.toString()} />
            <MetricRow
              label="Max Weight Holder"
              value={metrics.maxWeightHolder ? (nameMap.get(metrics.maxWeightHolder) ?? metrics.maxWeightHolder.slice(0, 8)) : "None"}
            />
            <MetricRow label="Delegating" value={metrics.delegatingCount.toString()} />
            <MetricRow label="Direct Voters" value={metrics.directVoterCount.toString()} />
            {Object.keys(metrics.chainLengthDistribution).length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Chain Length Distribution</p>
                <div className="flex gap-2">
                  {Object.entries(metrics.chainLengthDistribution).map(([len, count]) => (
                    <span key={len} className="text-xs bg-gray-100 px-2 py-1 rounded">
                      Len {len}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Visual indicator */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Concentration Level</p>
              <div className="w-full bg-gray-100 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    metrics.giniCoefficient < 0.3 ? "bg-green-400" : metrics.giniCoefficient < 0.6 ? "bg-yellow-400" : "bg-red-400"
                  }`}
                  style={{ width: `${Math.min(metrics.giniCoefficient * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Equal</span>
                <span>Concentrated</span>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ProfilePanel({
  assemblyId,
  participants,
  nameMap,
}: {
  assemblyId: string;
  participants: Array<{ id: string; name: string }>;
  nameMap: Map<string, string>;
}) {
  const [selectedPid, setSelectedPid] = useState("");
  const [profile, setProfile] = useState<DelegateProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProfile = async () => {
    if (!selectedPid) return;
    setLoading(true);
    try {
      const result = await api.getDelegateProfile(assemblyId, selectedPid);
      setProfile(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium text-gray-900">Delegate Profile</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <div>
          <Label>Participant</Label>
          <Select value={selectedPid} onChange={(e) => setSelectedPid(e.target.value)}>
            <option value="">Select...</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={loadProfile} disabled={!selectedPid || loading}>
          {loading ? "Loading..." : "Load Profile"}
        </Button>
        {profile && (
          <div className="space-y-3">
            <MetricRow label="Name" value={profile.name ?? "Unknown"} />
            <MetricRow label="Delegators" value={profile.delegatorsCount.toString()} />
            {profile.delegatorsIds.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Who delegates to them</p>
                <div className="flex flex-wrap gap-1">
                  {profile.delegatorsIds.map((id) => (
                    <span key={id} className="text-xs bg-brand-50 text-brand px-2 py-1 rounded">
                      {nameMap.get(id) ?? id.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {profile.myDelegations.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Their delegations</p>
                {profile.myDelegations.map((d, i) => (
                  <p key={i} className="text-sm text-gray-700">
                    Delegates to {nameMap.get(d.targetId) ?? d.targetId.slice(0, 8)}
                    {d.topicScope.length === 0 ? " (global)" : ` (${d.topicScope.length} topics)`}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function HistoryPanel({
  assemblyId,
  participants,
}: {
  assemblyId: string;
  participants: Array<{ id: string; name: string }>;
}) {
  const [selectedPid, setSelectedPid] = useState("");
  const [history, setHistory] = useState<VotingHistory | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    if (!selectedPid) return;
    setLoading(true);
    try {
      const result = await api.getVotingHistory(assemblyId, selectedPid);
      setHistory(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <h2 className="font-medium text-gray-900">Voting History</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label>Participant</Label>
            <Select value={selectedPid} onChange={(e) => setSelectedPid(e.target.value)}>
              <option value="">Select...</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <Button size="sm" onClick={loadHistory} disabled={!selectedPid || loading}>
            {loading ? "Loading..." : "Load History"}
          </Button>
        </div>
        {history && (
          history.history.length === 0 ? (
            <p className="text-sm text-gray-400">No votes recorded for this participant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Issue ID</th>
                    <th className="pb-2 font-medium">Choice</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.history.map((entry, idx) => (
                    <tr key={idx}>
                      <td className="py-2 font-mono text-xs text-gray-500">{entry.issueId.slice(0, 12)}...</td>
                      <td className="py-2 capitalize font-medium text-gray-900">{entry.choice}</td>
                      <td className="py-2 text-gray-500">{new Date(entry.votedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </CardBody>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}

// Routable sub-pages for direct links
export function AwarenessProfile() {
  const { assemblyId, participantId } = useParams();
  const { data: profile, loading, error } = useApi(
    () => api.getDelegateProfile(assemblyId!, participantId!),
    [assemblyId, participantId],
  );
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const nameMap = new Map((participantsData?.participants ?? []).map((p) => [p.id, p.name]));

  if (loading) return <Spinner />;
  if (error || !profile) return <ErrorBox message={error ?? "Profile not found"} />;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        {profile.name ?? "Unknown"} — Profile
      </h1>
      <Card>
        <CardBody className="space-y-3">
          <MetricRow label="Participant ID" value={profile.participantId} />
          <MetricRow label="Delegators" value={profile.delegatorsCount.toString()} />
          {profile.delegatorsIds.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">People who delegate to this participant</p>
              <div className="flex flex-wrap gap-1">
                {profile.delegatorsIds.map((id) => (
                  <span key={id} className="text-xs bg-brand-50 text-brand px-2 py-1 rounded">
                    {nameMap.get(id) ?? id.slice(0, 8)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.myDelegations.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Delegates to</p>
              {profile.myDelegations.map((d, i) => (
                <p key={i} className="text-sm text-gray-700">
                  {nameMap.get(d.targetId) ?? d.targetId.slice(0, 8)}
                  {d.topicScope.length === 0 ? " (global)" : ` (${d.topicScope.length} topics)`}
                </p>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function AwarenessHistory() {
  const { assemblyId, participantId } = useParams();
  const { data: history, loading, error } = useApi(
    () => api.getVotingHistory(assemblyId!, participantId!),
    [assemblyId, participantId],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!history) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Voting History</h1>
      <Card>
        <CardBody>
          {history.history.length === 0 ? (
            <p className="text-sm text-gray-400">No votes recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Issue ID</th>
                  <th className="pb-2 font-medium">Choice</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.history.map((entry, idx) => (
                  <tr key={idx}>
                    <td className="py-2 font-mono text-xs text-gray-500">{entry.issueId.slice(0, 12)}...</td>
                    <td className="py-2 capitalize font-medium text-gray-900">{entry.choice}</td>
                    <td className="py-2 text-gray-500">{new Date(entry.votedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
