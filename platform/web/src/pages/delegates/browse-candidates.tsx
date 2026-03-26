import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Candidacy, EndorsementCounts } from "../../api/types.js";
import { Button } from "../../components/ui.js";
import { MemberSearch } from "../../components/member-search.js";
import { CandidateCard } from "./candidate-card.js";
import { ChevronLeft, Search } from "lucide-react";

export function BrowseCandidates({
  assemblyId: _assemblyId,
  participantId,
  candidacies,
  participants,
  nameMap,
  topicNameMap,
  endorsementMap,
  onSelectCandidate,
  onSearchSelect,
  onBack,
}: {
  assemblyId: string;
  participantId: string;
  candidacies: Candidacy[];
  participants: Array<{ id: string; name: string }>;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  endorsementMap: Record<string, EndorsementCounts>;
  onSelectCandidate: (candidacyId: string) => void;
  onSearchSelect: (targetId: string, targetName: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("governance");
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="space-y-6">
      {/* Back breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-primary transition-colors min-h-[36px]"
      >
        <ChevronLeft size={16} />
        {t("delegates.backToList")}
      </button>

      {/* Heading */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary leading-tight mb-1">
          {t("delegates.browseCandidatesTitle")}
        </h1>
        <p className="text-sm text-text-muted">
          {t("delegates.browseSubtitle")}
        </p>
      </div>

      {/* Card grid */}
      {candidacies.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {candidacies.map((c) => (
            <CandidateCard
              key={c.id}
              candidacy={c}
              name={nameMap.get(c.participantId) ?? c.participantId.slice(0, 8)}
              topicNameMap={topicNameMap}
              endorsement={endorsementMap[c.id]}
              onClick={() => onSelectCandidate(c.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-text-muted">
          {t("delegates.browseSubtitle")}
        </div>
      )}

      {/* Search any member fallback */}
      <div className="pt-6 border-t border-border-default text-center">
        <p className="text-sm text-text-muted mb-3">{t("delegates.searchFallback")}</p>
        {showSearch ? (
          <div className="max-w-md mx-auto">
            <MemberSearch
              participants={participants}
              currentParticipantId={participantId}
              onSelect={(id) => {
                const name = nameMap.get(id) ?? "";
                onSearchSelect(id, name);
              }}
              placeholder={t("delegations.searchMember")}
            />
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowSearch(true)}>
            <Search size={16} />
            {t("delegates.searchAllMembers")}
          </Button>
        )}
      </div>
    </div>
  );
}
