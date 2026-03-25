import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";
import { useIdentity } from "../hooks/use-identity.js";
import * as api from "../api/client.js";
import type { Assembly, VotingHistory } from "../api/types.js";
import { Card, CardBody, Spinner, ErrorBox, EmptyState, Badge } from "../components/ui.js";

interface VoteEntry {
  assemblyId: string;
  assemblyName: string;
  issueId: string;
  issueTitle: string | null;
  choice: string;
  votedAt: string;
}

type SortField = "date" | "choice" | "group";
type SortDir = "asc" | "desc";

export function ProfileVotes() {
  const { t } = useTranslation("governance");
  const { storeUserId, memberships } = useIdentity();
  const [entries, setEntries] = useState<VoteEntry[]>([]);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssembly, setSelectedAssembly] = useState<string>("all");
  const [selectedChoice, setSelectedChoice] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!storeUserId || memberships.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const membershipMap = new Map(
          memberships.map((m) => [m.assemblyId, m.participantId]),
        );
        const allAssemblies = await api.listAssemblies();
        if (cancelled) return;
        const asmList = allAssemblies.filter((a) => membershipMap.has(a.id));
        setAssemblies(asmList);

        const allEntries: VoteEntry[] = [];
        await Promise.allSettled(
          asmList.map(async (asm) => {
            const pid = membershipMap.get(asm.id)!;
            try {
              const history: VotingHistory = await api.getVotingHistory(asm.id, pid);
              for (const h of history.history) {
                allEntries.push({
                  assemblyId: asm.id,
                  assemblyName: asm.name,
                  issueId: h.issueId,
                  issueTitle: h.issueTitle,
                  choice: h.choice,
                  votedAt: h.votedAt,
                });
              }
            } catch { /* skip assemblies that fail */ }
          }),
        );
        if (!cancelled) setEntries(allEntries);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeUserId, memberships]);

  const choices = useMemo(() => {
    const set = new Set(entries.map((e) => e.choice));
    return [...set].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => selectedAssembly === "all" || e.assemblyId === selectedAssembly)
      .filter((e) => selectedChoice === "all" || e.choice === selectedChoice)
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === "date") {
          cmp = new Date(a.votedAt).getTime() - new Date(b.votedAt).getTime();
        } else if (sortField === "choice") {
          cmp = a.choice.localeCompare(b.choice);
        } else if (sortField === "group") {
          cmp = a.assemblyName.localeCompare(b.assemblyName);
        }
        return sortDir === "desc" ? -cmp : cmp;
      });
  }, [entries, selectedAssembly, selectedChoice, sortField, sortDir]);

  if (!storeUserId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-text-muted">{t("profileVotes.noIdentity")}</p>
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (error) return <div className="max-w-3xl mx-auto"><ErrorBox message={error} /></div>;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-1">{t("profileVotes.title")}</h1>
      <p className="text-sm text-text-muted mb-6">{t("profileVotes.vote", { count: entries.length })} {t("profileVotes.group", { count: new Set(entries.map((e) => e.assemblyId)).size })}</p>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={selectedAssembly}
          onChange={(e) => setSelectedAssembly(e.target.value)}
          className="px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-raised focus:outline-none focus:ring-2 focus:ring-focus-ring/20 focus:border-accent"
        >
          <option value="all">{t("profileVotes.allGroups")}</option>
          {assemblies.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {choices.length > 1 && (
          <select
            value={selectedChoice}
            onChange={(e) => setSelectedChoice(e.target.value)}
            className="px-3 py-2 border border-border-default rounded-lg text-sm bg-surface-raised focus:outline-none focus:ring-2 focus:ring-focus-ring/20 focus:border-accent"
          >
            <option value="all">{t("profileVotes.allChoices")}</option>
            {choices.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-1 mb-4 text-xs text-text-muted">
        <span>{t("profileVotes.sortBy")}</span>
        {(["date", "group", "choice"] as SortField[]).map((field) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={`px-2 py-1 rounded transition-colors ${sortField === field ? "bg-accent/10 text-accent-text font-medium" : "hover:bg-interactive-hover"}`}
          >
            {field === "date" ? t("profileVotes.date") : field === "group" ? t("profileVotes.group", { count: 1 }) : t("profileVotes.choice")}
            {sortField === field && (sortDir === "desc" ? " ↓" : " ↑")}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={t("profileVotes.noVotes")}
          description={entries.length > 0 ? t("profileVotes.adjustFilters") : t("profileVotes.noVotesDesc")}
        />
      ) : (
        <Card>
          <CardBody className="divide-y divide-border-subtle">
            {filtered.map((entry, idx) => (
              <div key={`${entry.issueId}-${idx}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={choiceColor(entry.choice)}>{entry.choice}</Badge>
                    <span className="text-sm text-text-primary truncate">{entry.issueTitle ?? entry.issueId.slice(0, 12)}</span>
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">{entry.assemblyName}</div>
                </div>
                <span className="text-xs text-text-tertiary shrink-0">
                  {formatDate(entry.votedAt)}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function choiceColor(choice: string): "green" | "red" | "gray" {
  const lower = choice.toLowerCase();
  if (lower === "for" || lower === "yes" || lower === "approve" || lower === "aye") return "green";
  if (lower === "against" || lower === "no" || lower === "reject" || lower === "nay") return "red";
  return "gray";
}
