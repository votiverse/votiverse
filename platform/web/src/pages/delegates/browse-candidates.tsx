import type { Candidacy } from "../../api/types.js";

export function BrowseCandidates(_props: {
  assemblyId: string;
  participantId: string;
  candidacies: Candidacy[];
  participants: Array<{ id: string; name: string }>;
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  onSelectCandidate: (candidacyId: string) => void;
  onSearchSelect: (targetId: string, targetName: string) => void;
  onBack: () => void;
}) {
  return <div>Browse Candidates (TODO)</div>;
}
