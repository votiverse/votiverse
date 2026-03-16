import { useState, useEffect, useMemo } from "react";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Assembly, DelegateProfile } from "../api/types.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";

interface AssemblyDelegateData {
  assembly: Assembly;
  profile: DelegateProfile | null;
}

export function ProfileDelegates() {
  const { participantId } = useIdentity();
  const [data, setData] = useState<AssemblyDelegateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssembly, setSelectedAssembly] = useState<string>("all");

  useEffect(() => {
    if (!participantId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const assemblies = await api.listAssemblies();
        const results: AssemblyDelegateData[] = [];
        await Promise.allSettled(
          assemblies.map(async (asm) => {
            try {
              const profile = await api.getDelegateProfile(asm.id, participantId);
              results.push({ assembly: asm, profile });
            } catch {
              results.push({ assembly: asm, profile: null });
            }
          }),
        );
        if (!cancelled) setData(results);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [participantId]);

  const filtered = useMemo(() => {
    return data
      .filter((d) => selectedAssembly === "all" || d.assembly.id === selectedAssembly)
      .filter((d) => (d.profile?.myDelegations.length ?? 0) > 0);
  }, [data, selectedAssembly]);

  if (!participantId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-gray-500">No identity selected.</p>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>;

  const totalDelegates = data.reduce((sum, d) => sum + (d.profile?.myDelegations.length ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Your delegates</h1>
      <p className="text-sm text-gray-500 mb-6">{totalDelegates} delegate{totalDelegates !== 1 ? "s" : ""} across {data.filter((d) => (d.profile?.myDelegations.length ?? 0) > 0).length} group{data.filter((d) => (d.profile?.myDelegations.length ?? 0) > 0).length !== 1 ? "s" : ""}</p>

      {data.length > 1 && (
        <div className="mb-6">
          <select
            value={selectedAssembly}
            onChange={(e) => setSelectedAssembly(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <option value="all">All groups</option>
            {data.map((d) => (
              <option key={d.assembly.id} value={d.assembly.id}>{d.assembly.name}</option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No delegates found"
          description="You haven't delegated to anyone yet."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map(({ assembly, profile }) => (
            <Card key={assembly.id}>
              <CardHeader>
                <h2 className="font-medium text-gray-900">{assembly.name}</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-2">
                  {profile!.myDelegations.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Avatar name={d.targetName ?? "?"} size="sm" />
                      <div className="min-w-0">
                        <span className="text-sm text-gray-900 font-medium">{d.targetName ?? d.targetId.slice(0, 12)}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {d.topicScope.length === 0 ? "Global" : `${d.topicScope.length} topic${d.topicScope.length !== 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
