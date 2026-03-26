import type { Candidacy } from "../../api/types.js";

export function CandidateProfile(_props: {
  assemblyId: string;
  candidacyId: string;
  candidacies: Candidacy[];
  nameMap: Map<string, string>;
  topicNameMap: Map<string, string>;
  onDelegate: (targetId: string, targetName: string, candidacyTopics: string[]) => void;
  onNavigate: (candidacyId: string) => void;
  onBack: () => void;
}) {
  return <div>Candidate Profile (TODO)</div>;
}
