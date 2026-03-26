import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../../hooks/use-api.js";
import { useIdentity } from "../../hooks/use-identity.js";
import { useAssembly } from "../../hooks/use-assembly.js";
import * as api from "../../api/client.js";
import type { Topic, Candidacy } from "../../api/types.js";
import { Spinner, ErrorBox, EmptyState } from "../../components/ui.js";
import { DelegatesList } from "./delegates-list.js";
import { BrowseCandidates } from "./browse-candidates.js";
import { CandidateProfile } from "./candidate-profile.js";
import { ConfigureDelegation } from "./configure-delegation.js";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type DelegatesView =
  | { level: "list" }
  | { level: "browse" }
  | { level: "detail"; candidacyId: string }
  | { level: "form"; targetId: string; targetName: string; candidacyTopics?: string[]; fromSearch?: boolean };

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function Delegations() {
  const { t } = useTranslation("governance");
  const { assemblyId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = assemblyId ? getParticipantId(assemblyId) : null;
  const { assembly } = useAssembly(assemblyId);

  const [view, setView] = useState<DelegatesView>({ level: "list" });

  // Data fetching — shared across all levels
  const { data, loading, error, refetch } = useApi(() => api.listDelegations(assemblyId!), [assemblyId]);
  const { data: participantsData } = useApi(() => api.listParticipants(assemblyId!), [assemblyId]);
  const { data: topicsData } = useApi(() => api.listTopics(assemblyId!), [assemblyId]);

  const delegationCandidacy = assembly?.config.delegation.candidacy ?? false;
  const delegationEnabled = delegationCandidacy || (assembly?.config.delegation.transferable ?? false);
  const { data: candidaciesData } = useApi(
    () => delegationCandidacy ? api.listCandidacies(assemblyId!, "active") : Promise.resolve({ candidacies: [] }),
    [assemblyId, delegationCandidacy],
  );

  const isTopicScoped = delegationEnabled;

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={refetch} />;

  if (!participantId) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("delegations.title")}</h1>
        <EmptyState
          title={t("delegations.noIdentity")}
          description={t("delegations.noIdentityDesc")}
        />
      </div>
    );
  }

  // Derived data
  const allDelegations = data?.delegations ?? [];
  const participants = participantsData?.participants ?? [];
  const topics: Topic[] = topicsData?.topics ?? [];
  const candidacies: Candidacy[] = candidaciesData?.candidacies ?? [];
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));
  const topicNameMap = new Map(topics.map((t) => [t.id, t.name]));
  const topicParentMap = new Map(topics.map((t) => [t.id, t.parentId]));

  // Filter to topic-scoped delegations (exclude issue-scoped), sorted broadest first
  const myOutgoing = allDelegations
    .filter((d) => d.sourceId === participantId && !d.issueScope)
    .sort((a, b) => {
      if (a.topicScope.length === 0 && b.topicScope.length > 0) return -1;
      if (a.topicScope.length > 0 && b.topicScope.length === 0) return 1;
      const aIsChild = a.topicScope.some((id) => topicParentMap.get(id) !== null);
      const bIsChild = b.topicScope.some((id) => topicParentMap.get(id) !== null);
      if (!aIsChild && bIsChild) return -1;
      if (aIsChild && !bIsChild) return 1;
      const aName = a.topicScope.map((id) => topicNameMap.get(id) ?? "").join(",");
      const bName = b.topicScope.map((id) => topicNameMap.get(id) ?? "").join(",");
      return aName.localeCompare(bName);
    });

  // Navigation callbacks
  const goList = () => setView({ level: "list" });
  const goBrowse = () => setView({ level: "browse" });
  const goDetail = (candidacyId: string) => setView({ level: "detail", candidacyId });
  const goForm = (targetId: string, targetName: string, candidacyTopics?: string[], fromSearch?: boolean) =>
    setView({ level: "form", targetId, targetName, candidacyTopics, fromSearch });
  const onDelegationCreated = () => { refetch(); goList(); };

  // Animation direction
  const animClass = view.level === "list" ? "animate-page-in" : "animate-page-in";

  return (
    <div className={`max-w-3xl mx-auto ${animClass}`} key={view.level}>
      {view.level === "list" && (
        <DelegatesList
          assemblyId={assemblyId!}
          participantId={participantId}
          myOutgoing={myOutgoing}
          nameMap={nameMap}
          topics={topics}
          refetch={refetch}
          onBrowse={goBrowse}
        />
      )}

      {view.level === "browse" && (
        <BrowseCandidates
          assemblyId={assemblyId!}
          participantId={participantId}
          candidacies={candidacies}
          participants={participants}
          nameMap={nameMap}
          topicNameMap={topicNameMap}
          onSelectCandidate={goDetail}
          onSearchSelect={(targetId, targetName) => goForm(targetId, targetName, undefined, true)}
          onBack={goList}
        />
      )}

      {view.level === "detail" && (
        <CandidateProfile
          assemblyId={assemblyId!}
          candidacyId={view.candidacyId}
          candidacies={candidacies}
          nameMap={nameMap}
          topicNameMap={topicNameMap}
          onDelegate={(targetId, targetName, candidacyTopics) => goForm(targetId, targetName, candidacyTopics)}
          onNavigate={goDetail}
          onBack={goBrowse}
        />
      )}

      {view.level === "form" && (
        <ConfigureDelegation
          assemblyId={assemblyId!}
          targetId={view.targetId}
          targetName={view.targetName}
          candidacyTopics={view.candidacyTopics}
          isTopicScoped={isTopicScoped}
          onConfirm={onDelegationCreated}
          onBack={() => view.fromSearch ? goBrowse() : setView({ level: "detail", candidacyId: candidacies.find((c) => c.participantId === view.targetId)?.id ?? "" })}
        />
      )}
    </div>
  );
}
