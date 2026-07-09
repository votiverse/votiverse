import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api.js";
import { useAttention } from "../hooks/use-attention.js";
import { signal } from "../hooks/use-mutation-signal.js";
import * as api from "../api/client.js";
import { Card, CardBody, Button, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";
import { quadrantLabel } from "../lib/presets.js";

// ── Group list page ───────────────────────────────────────────────
//
// Group creation lives on the dedicated /groups/new page (create-group.tsx),
// which is the single source of truth for the creation form. Both "New Group"
// affordances here route to it, matching the sidebar's + link.

export function GroupList() {
  const { t } = useTranslation("governance");
  const navigate = useNavigate();
  const { data: groups, loading, error, refetch } = useApi(() => api.listGroups(), [], "groups");
  const { data: archived } = useApi(() => api.listArchivedGroups(), [], "groups");
  const { pendingByGroup, groupSummaries } = useAttention();
  const activeByGroup = Object.fromEntries(groupSummaries.map((s) => [s.group.id, s.activeEventCount]));

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary">{t("groupList.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("groupList.subtitle")}</p>
        </div>
        <Button onClick={() => navigate("/groups/new")}>{t("groupList.newGroup")}</Button>
      </div>

      {!groups || groups.length === 0 ? (
        <EmptyState
          title={t("groupList.noGroups")}
          description={t("groupList.noGroupsDesc")}
          action={<Button onClick={() => navigate("/groups/new")}>{t("groupList.newGroup")}</Button>}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((grp) => (
            <Link key={grp.id} to={`/group/${grp.id}/events`} className="block">
              <Card className="hover:border-accent-muted hover:shadow transition-all">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GroupInitial name={grp.name} />
                      <div>
                        <h3 className="font-medium text-text-primary">{grp.name}</h3>
                        <p className="text-sm text-text-muted mt-0.5">{quadrantLabel(grp.config, t)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {(activeByGroup[grp.id] ?? 0) > 0 && (
                        <Badge color="gray">{t("groupList.openVote", { count: activeByGroup[grp.id] })}</Badge>
                      )}
                      {(pendingByGroup[grp.id] ?? 0) > 0 && (
                        <Badge color="red">{t("groupList.needsYou", { count: pendingByGroup[grp.id] })}</Badge>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {archived && archived.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3">{t("groupList.archivedTitle")}</h2>
          <div className="space-y-3">
            {archived.map((grp) => (
              <Card key={grp.id} className="opacity-75">
                <CardBody>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <GroupInitial name={grp.name} />
                      <div className="min-w-0">
                        <h3 className="font-medium text-text-primary truncate">{grp.name}</h3>
                        <p className="text-sm text-text-muted mt-0.5">{t("groupList.archivedLabel")}</p>
                      </div>
                    </div>
                    <RestoreButton groupId={grp.id} t={t} />
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Restore button (archived groups) ──────────────────────────────────

function RestoreButton({ groupId, t }: { groupId: string; t: (key: string) => string }) {
  const [restoring, setRestoring] = useState(false);
  const handleRestore = async () => {
    setRestoring(true);
    try {
      await api.restoreGroup(groupId);
      signal("groups"); // refetches active + archived lists and the sidebar
    } catch {
      setRestoring(false);
    }
  };
  return (
    <Button variant="secondary" size="sm" className="shrink-0" disabled={restoring} onClick={handleRestore}>
      {restoring ? t("common:loading") : t("groupList.restore")}
    </Button>
  );
}

// ── Group icon ────────────────────────────────────────────────────

const INITIAL_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

function GroupInitial({ name }: { name: string }) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (
    <div className={`w-9 h-9 ${INITIAL_COLORS[hash % INITIAL_COLORS.length]} rounded-lg flex items-center justify-center shrink-0`}>
      <span className="text-text-on-accent font-semibold text-sm">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}
