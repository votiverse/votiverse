import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("governance");
  const { storeUserId, memberships } = useIdentity();
  const [data, setData] = useState<AssemblyDelegateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssembly, setSelectedAssembly] = useState<string>("all");

  useEffect(() => {
    if (!storeUserId || memberships.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const membershipMap = new Map(
          memberships.map((m) => [m.assemblyId, m.participantId]),
        );
        const allAssemblies = await api.listAssemblies();
        const assemblies = allAssemblies.filter((a) => membershipMap.has(a.id));
        const results: AssemblyDelegateData[] = [];
        await Promise.allSettled(
          assemblies.map(async (asm) => {
            const pid = membershipMap.get(asm.id)!;
            try {
              const profile = await api.getDelegateProfile(asm.id, pid);
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
  }, [storeUserId, memberships]);

  const filtered = useMemo(() => {
    return data
      .filter((d) => selectedAssembly === "all" || d.assembly.id === selectedAssembly)
      .filter((d) => (d.profile?.myDelegations.length ?? 0) > 0);
  }, [data, selectedAssembly]);

  if (!storeUserId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-text-muted">{t("profileDelegates.noIdentity")}</p>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>;

  const totalDelegates = data.reduce((sum, d) => sum + (d.profile?.myDelegations.length ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-text-primary mb-1">{t("profileDelegates.title")}</h1>
      <p className="text-sm text-text-muted mb-6">{t("profileDelegates.summary", { count: totalDelegates, delegates: totalDelegates, groups: data.filter((d) => (d.profile?.myDelegations.length ?? 0) > 0).length })}</p>

      {data.length > 1 && (
        <div className="mb-6">
          <select
            value={selectedAssembly}
            onChange={(e) => setSelectedAssembly(e.target.value)}
            className="px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-raised focus:outline-none focus:ring-2 focus:ring-focus-ring/20 focus:border-accent"
          >
            <option value="all">{t("profileDelegates.allGroups")}</option>
            {data.map((d) => (
              <option key={d.assembly.id} value={d.assembly.id}>{d.assembly.name}</option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={t("profileDelegates.noDelegates")}
          description={t("profileDelegates.noDelegatesDesc")}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map(({ assembly, profile }) => (
            <Card key={assembly.id}>
              <CardHeader>
                <h2 className="font-medium text-text-primary">{assembly.name}</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-2">
                  {profile!.myDelegations.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Avatar name={d.targetName ?? "?"} size="sm" />
                      <div className="min-w-0">
                        <span className="text-sm text-text-primary font-medium">{d.targetName ?? d.targetId.slice(0, 12)}</span>
                        <span className="text-xs text-text-tertiary ml-2">
                          {d.topicScope.length === 0 ? t("profileDelegates.global") : t("profileDelegates.topic", { count: d.topicScope.length })}
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
