import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Group, DelegateProfile } from "../api/types.js";
import { Card, CardHeader, CardBody, Spinner, ErrorBox, Input, EmptyState } from "../components/ui.js";
import { Avatar } from "../components/avatar.js";

interface GroupDelegatorData {
  group: Group;
  profile: DelegateProfile | null;
}

export function ProfileDelegators() {
  const { t } = useTranslation("governance");
  const { storeUserId, memberships } = useIdentity();
  const [data, setData] = useState<GroupDelegatorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");

  useEffect(() => {
    if (!storeUserId || memberships.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const membershipMap = new Map(
          memberships.map((m) => [m.groupId, m.participantId]),
        );
        const allAssemblies = await api.listGroups();
        const groups = allAssemblies.filter((a) => membershipMap.has(a.id));
        const results: GroupDelegatorData[] = [];
        await Promise.allSettled(
          groups.map(async (grp) => {
            const pid = membershipMap.get(grp.id)!;
            try {
              const profile = await api.getDelegateProfile(grp.id, pid);
              results.push({ group: grp, profile });
            } catch {
              results.push({ group: grp, profile: null });
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
    const search = filter.toLowerCase();
    return data
      .filter((d) => selectedGroup === "all" || d.group.id === selectedGroup)
      .map((d) => ({
        ...d,
        delegators: (d.profile?.delegators ?? []).filter(
          (del) => !search || (del.name ?? del.id).toLowerCase().includes(search),
        ),
      }))
      .filter((d) => d.delegators.length > 0);
  }, [data, filter, selectedGroup]);

  if (!storeUserId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-text-muted">{t("profileDelegators.noIdentity")}</p>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>;

  const totalDelegators = data.reduce((sum, d) => sum + (d.profile?.delegatorsCount ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-1">{t("profileDelegators.title")}</h1>
      <p className="text-sm text-text-muted mb-6">{t("profileDelegators.summary", { count: totalDelegators, delegators: totalDelegators, groups: data.filter((d) => (d.profile?.delegatorsCount ?? 0) > 0).length })}</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("profileDelegators.searchPlaceholder")}
          className="flex-1"
        />
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-raised focus:outline-none focus:ring-2 focus:ring-focus-ring/20 focus:border-accent"
        >
          <option value="all">{t("profileDelegators.allGroups")}</option>
          {data.map((d) => (
            <option key={d.group.id} value={d.group.id}>{d.group.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={t("profileDelegators.noDelegators")}
          description={filter ? t("profileDelegators.noDelegatorsSearchDesc") : t("profileDelegators.noDelegatorsDesc")}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map(({ group, delegators }) => (
            <Card key={group.id}>
              <CardHeader>
                <h2 className="font-medium text-text-primary">{group.name}</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-2">
                  {delegators.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 py-2">
                      <Avatar name={d.name ?? "?"} size="sm" />
                      <span className="text-sm text-text-primary font-medium">{d.name ?? d.id.slice(0, 12)}</span>
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
