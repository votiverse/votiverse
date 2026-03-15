/** Types mirroring VCP API response shapes. */

export interface Assembly {
  id: string;
  organizationId: string | null;
  name: string;
  config: GovernanceConfig;
  status: string;
  createdAt: string;
}

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
  };
  ballot: {
    secrecy: string;
    delegateVoteVisibility: string;
    votingMethod: string;
    supermajorityThreshold: number;
    quorum: number;
    participationMode: string;
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

export interface Tally {
  issueId: string;
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
    choice: string;
    votedAt: string;
  }>;
}

export interface DelegateProfile {
  participantId: string;
  name: string | null;
  delegatorsCount: number;
  delegatorsIds: string[];
  myDelegations: Array<{
    targetId: string;
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
