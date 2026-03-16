/** Types mirroring VCP API response shapes. */

export interface User {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
}

export interface Membership {
  assemblyId: string;
  assemblyName: string;
  participantId: string;
}

export interface Assembly {
  id: string;
  organizationId: string | null;
  name: string;
  config: GovernanceConfig;
  status: string;
  createdAt: string;
}

export interface DelegationVisibilityConfig {
  mode: "public" | "private";
  incomingVisibility: "direct" | "chain";
}

export type ParticipantStatus = "active" | "inactive" | "sunset";

export interface GovernanceConfig {
  name: string;
  description: string;
  delegation: {
    enabled: boolean;
    topicScoped: boolean;
    transitive: boolean;
    revocableAnytime: boolean;
    maxChainDepth: number | null;
    maxDelegatesPerParticipant: number | null;
    maxAge: number | null;
    visibility: DelegationVisibilityConfig;
  };
  ballot: {
    secrecy: string;
    delegateVoteVisibility: string;
    votingMethod: string;
    supermajorityThreshold: number;
    quorum: number;
    participationMode: string;
    resultsVisibility: string;
  };
  features: {
    predictions: string;
    communityNotes: boolean;
    polls: boolean;
    awarenessIntensity: string;
    blockchainIntegrity: boolean;
  };
  thresholds: {
    concentrationAlertThreshold: number;
  };
}

export interface Participant {
  id: string;
  name: string;
  status?: ParticipantStatus;
  registeredAt?: string;
}

export interface VotingEvent {
  id: string;
  title: string;
  description: string;
  status?: string;
  issueIds: string[];
  issues?: Issue[];
  eligibleParticipantIds: string[];
  timeline: {
    deliberationStart: string;
    votingStart: string;
    votingEnd: string;
  };
  createdAt: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  topicIds: string[];
  choices?: string[];
}

export interface Topic {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface Delegation {
  id: string;
  sourceId: string;
  targetId: string;
  topicScope: string[];
  createdAt: string;
  active: boolean;
}

export interface DelegationChain {
  participantId: string;
  issueId: string;
  chain: string[];
  terminalVoter: string | null;
  votedDirectly: boolean;
}

export interface MyWeight {
  participantId: string;
  issueId: string;
  directWeight: number;
  delegatedWeight: number;
  totalWeight: number;
  delegatorsCount: number;
  delegators: string[];
}

export interface Tally {
  issueId: string;
  sealed?: boolean;
  winner: string | null;
  counts: Record<string, number>;
  totalVotes: number;
  quorumMet: boolean;
  quorumThreshold: number;
  eligibleCount: number;
  participatingCount: number;
}

export interface WeightDist {
  issueId: string;
  weights: Record<string, number>;
  totalWeight: number;
}

export interface ConcentrationMetrics {
  issueId: string;
  giniCoefficient: number;
  maxWeight: number;
  maxWeightHolder: string | null;
  chainLengthDistribution: Record<number, number>;
  delegatingCount: number;
  directVoterCount: number;
}

export interface VotingHistory {
  participantId: string;
  history: Array<{
    issueId: string;
    issueTitle: string | null;
    choice: string;
    votedAt: string;
  }>;
}

export type ParticipationStatus = "direct" | "delegated" | "absent";

export interface ParticipationRecord {
  participantId: string;
  issueId: string;
  status: ParticipationStatus;
  effectiveChoice: string | null;
  delegateId: string | null;
  terminalVoterId: string | null;
  chain: string[];
}

export interface DelegateProfile {
  participantId: string;
  name: string | null;
  delegatorsCount: number;
  delegators: Array<{ id: string; name: string | null }>;
  delegatorsIds: string[];
  myDelegations: Array<{
    targetId: string;
    targetName: string | null;
    topicScope: string[];
  }>;
}

export interface Poll {
  id: string;
  title: string;
  status: string;
  questions: PollQuestion[];
  topicIds: string[];
  schedule: number;
  closesAt: number;
  createdBy: string;
  hasResponded?: boolean;
}

export interface PollQuestion {
  id: string;
  text: string;
  questionType: { type: string; [key: string]: unknown };
  topicIds: string[];
  tags: string[];
}

export interface PollResults {
  pollId: string;
  responseCount: number;
  responseRate: number;
  questionResults: Array<{
    questionId: string;
    responseCount: number;
    mean?: number;
    median?: number;
    standardDeviation?: number;
    distribution: Record<string, number>;
  }>;
}

// ---- Predictions ----

export interface PredictionClaim {
  variable: string;
  baselineValue?: number;
  timeframe: { unit: string; value: number; anchor?: string };
  methodology?: string;
  pattern: Record<string, unknown>;
}

export interface Prediction {
  id: string;
  proposalId: string;
  participantId: string;
  claim: PredictionClaim;
  commitmentHash: string;
  committedAt: string;
}

export interface PredictionEvaluation {
  predictionId: string;
  status: string;
  accuracy: number;
  confidence: string;
  evaluatedAt: number;
  outcomeCount: number;
  trajectory: string;
}

export interface TrackRecord {
  participantId: string;
  totalPredictions: number;
  evaluatedPredictions: number;
  averageAccuracy: number;
  byStatus: Record<string, number>;
}
