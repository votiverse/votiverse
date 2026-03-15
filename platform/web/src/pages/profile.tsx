import { useState, useEffect } from "react";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Assembly, DelegateProfile, VotingHistory } from "../api/types.js";
import { Card, CardHeader, CardBody, Button, Spinner, Badge } from "../components/ui.js";

interface AssemblyProfileData {
  assembly: Assembly;
  profile: DelegateProfile | null;
  history: VotingHistory | null;
}

export function Profile() {
  const { participantId, participantName, clearIdentity } = useIdentity();
  const [data, setData] = useState<AssemblyProfileData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!participantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const assemblies = await api.listAssemblies();
        const results: AssemblyProfileData[] = [];

        await Promise.allSettled(
          assemblies.map(async (asm) => {
            const [profileRes, historyRes] = await Promise.allSettled([
              api.getDelegateProfile(asm.id, participantId),
              api.getVotingHistory(asm.id, participantId),
            ]);

            results.push({
              assembly: asm,
              profile: profileRes.status === "fulfilled" ? profileRes.value : null,
              history: historyRes.status === "fulfilled" ? historyRes.value : null,
            });
          }),
        );

        if (!cancelled) setData(results);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [participantId]);

  if (!participantId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-gray-500">No identity selected. Go to the Dashboard to pick who you are.</p>
      </div>
    );
  }

  if (loading) return <Spinner />;

  const totalVotes = data.reduce((sum, d) => sum + (d.history?.history.length ?? 0), 0);
  const totalDelegators = data.reduce((sum, d) => sum + (d.profile?.delegatorsCount ?? 0), 0);
  const totalOutbound = data.reduce((sum, d) => sum + (d.profile?.myDelegations.length ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">Profile</h1>

      {/* Identity card */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center text-white font-semibold text-xl">
                {(participantName ?? "?")[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">{participantName}</p>
                <p className="text-xs text-gray-400 font-mono">{participantId.slice(0, 16)}...</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={clearIdentity}>
              Switch
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-semibold text-gray-900">{totalVotes}</div>
            <div className="text-xs text-gray-500 mt-0.5">Votes Cast</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-semibold text-gray-900">{totalDelegators}</div>
            <div className="text-xs text-gray-500 mt-0.5">Delegators</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-semibold text-gray-900">{totalOutbound}</div>
            <div className="text-xs text-gray-500 mt-0.5">Delegations</div>
          </CardBody>
        </Card>
      </div>

      {/* Per-assembly breakdown */}
      {data.map(({ assembly, profile, history }) => (
        <Card key={assembly.id} className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900">{assembly.name}</h2>
              <Badge color="gray">{assembly.config.name}</Badge>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Delegation info */}
            {profile && (
              <div className="space-y-2">
                {profile.delegatorsCount > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      {profile.delegatorsCount} participant{profile.delegatorsCount !== 1 ? "s" : ""} delegate to you
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {profile.delegatorsIds.map((id) => (
                        <span key={id} className="text-xs bg-brand/10 text-brand px-2 py-1 rounded">
                          {id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {profile.myDelegations.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Your outbound delegations</p>
                    {profile.myDelegations.map((d, i) => (
                      <p key={i} className="text-sm text-gray-700">
                        Delegates to {d.targetId.slice(0, 8)}
                        {d.topicScope.length === 0 ? " (global)" : ` (${d.topicScope.length} topics)`}
                      </p>
                    ))}
                  </div>
                )}
                {profile.delegatorsCount === 0 && profile.myDelegations.length === 0 && (
                  <p className="text-sm text-gray-400">No delegations in this assembly.</p>
                )}
              </div>
            )}

            {/* Voting history */}
            {history && history.history.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Recent votes ({history.history.length} total)
                </p>
                <div className="space-y-1">
                  {history.history.slice(0, 5).map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="capitalize font-medium text-gray-900">{entry.choice}</span>
                        <span className="text-xs text-gray-400 font-mono">{entry.issueId.slice(0, 12)}...</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(entry.votedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {history.history.length > 5 && (
                    <p className="text-xs text-gray-400 text-center mt-1">
                      +{history.history.length - 5} more votes
                    </p>
                  )}
                </div>
              </div>
            )}
            {history && history.history.length === 0 && (
              <p className="text-sm text-gray-400">No votes recorded in this assembly.</p>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
