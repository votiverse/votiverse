import { useState, useEffect, useMemo } from "react";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Assembly, DelegateProfile } from "../api/types.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, Input, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";

interface AssemblyDelegatorData {
  assembly: Assembly;
  profile: DelegateProfile | null;
}

export function ProfileDelegators() {
  const { participantId } = useIdentity();
  const [data, setData] = useState<AssemblyDelegatorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedAssembly, setSelectedAssembly] = useState<string>("all");

  useEffect(() => {
    if (!participantId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const assemblies = await api.listAssemblies();
        const results: AssemblyDelegatorData[] = [];
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
    const search = filter.toLowerCase();
    return data
      .filter((d) => selectedAssembly === "all" || d.assembly.id === selectedAssembly)
      .map((d) => ({
        ...d,
        delegators: (d.profile?.delegators ?? []).filter(
          (del) => !search || (del.name ?? del.id).toLowerCase().includes(search),
        ),
      }))
      .filter((d) => d.delegators.length > 0);
  }, [data, filter, selectedAssembly]);

  if (!participantId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-gray-500">No identity selected.</p>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>;

  const totalDelegators = data.reduce((sum, d) => sum + (d.profile?.delegatorsCount ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">People who delegate to you</h1>
      <p className="text-sm text-gray-500 mb-6">{totalDelegators} delegator{totalDelegators !== 1 ? "s" : ""} across {data.filter((d) => (d.profile?.delegatorsCount ?? 0) > 0).length} group{data.filter((d) => (d.profile?.delegatorsCount ?? 0) > 0).length !== 1 ? "s" : ""}</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name..."
          className="flex-1"
        />
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

      {filtered.length === 0 ? (
        <EmptyState
          title="No delegators found"
          description={filter ? "Try a different search." : "No one delegates to you yet."}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map(({ assembly, delegators }) => (
            <Card key={assembly.id}>
              <CardHeader>
                <h2 className="font-medium text-gray-900">{assembly.name}</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-2">
                  {delegators.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 py-2">
                      <Avatar name={d.name ?? "?"} size="sm" />
                      <span className="text-sm text-gray-900 font-medium">{d.name ?? d.id.slice(0, 12)}</span>
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
