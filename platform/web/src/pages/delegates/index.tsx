import { useState, useMemo } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../../hooks/use-api.js";
import { useIdentity } from "../../hooks/use-identity.js";
import { useGroup } from "../../hooks/use-group.js";
import * as api from "../../api/client.js";
import type { Topic, Candidacy, EndorsementCounts } from "../../api/types.js";
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
  const { groupId } = useParams();
  const { getParticipantId } = useIdentity();
  const participantId = groupId ? getParticipantId(groupId) : null;
  const { group } = useGroup(groupId);

  const [view, setView] = useState<DelegatesView>({ level: "list" });

  // Data fetching — shared across all levels
  const { data, loading, error, refetch } = useApi(() => api.listDelegations(groupId!), [groupId]);
  const { data: participantsData } = useApi(() => api.listParticipants(groupId!), [groupId]);
  const { data: topicsData } = useApi(() => api.listTopics(groupId!), [groupId]);

  const delegationCandidacy = group?.config?.delegation.candidacy ?? false;
  const delegationEnabled = delegationCandidacy || (group?.config?.delegation.transferable ?? false);
  const { data: candidaciesData } = useApi(
    () => delegationCandidacy ? api.listCandidacies(groupId!, "active") : Promise.resolve({ candidacies: [] }),
    [groupId, delegationCandidacy],
  );

  // Fetch endorsement counts for all candidacies
  const candidacyIds = (candidaciesData?.candidacies ?? []).map((c) => c.id);
  const { data: endorsementData, refetch: refetchEndorsements } = useApi(
    () => candidacyIds.length > 0 ? api.getEndorsements(groupId!, "candidacy", candidacyIds) : Promise.resolve({ endorsements: {} }),
    [groupId, candidacyIds.join(",")],
  );
  const endorsementMap: Record<string, EndorsementCounts> = endorsementData?.endorsements ?? {};

  // Fetch events to resolve issue titles for issue-scoped delegations
  const { data: eventsData } = useApi(() => api.listEvents(groupId!), [groupId]);
  const issueEventMap = useMemo(() => {
    const map = new Map<string, { issueTitle: string; eventTitle: string }>();
    for (const evt of eventsData?.events ?? []) {
      for (const issue of evt.issues ?? []) {
        map.set(issue.id, { issueTitle: issue.title, eventTitle: evt.title });
      }
    }
    return map;
  }, [eventsData]);

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

  // Split into topic/global delegations and issue-scoped delegations
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

  const myIssueDelegations = allDelegations
    .filter((d) => d.sourceId === participantId && !!d.issueScope);

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
          groupId={groupId!}
          participantId={participantId}
          myOutgoing={myOutgoing}
          issueDelegations={myIssueDelegations}
          issueEventMap={issueEventMap}
          nameMap={nameMap}
          topics={topics}
          candidacies={candidacies}
          refetch={refetch}
          onBrowse={goBrowse}
          onViewProfile={goDetail}
        />
      )}

      {view.level === "browse" && (
        <BrowseCandidates
          groupId={groupId!}
          participantId={participantId}
          candidacies={candidacies}
          participants={participants}
          nameMap={nameMap}
          topicNameMap={topicNameMap}
          endorsementMap={endorsementMap}
          onSelectCandidate={goDetail}
          onSearchSelect={(targetId, targetName) => goForm(targetId, targetName, undefined, true)}
          onBack={goList}
        />
      )}

      {view.level === "detail" && (
        <CandidateProfile
          groupId={groupId!}
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
          groupId={groupId!}
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
