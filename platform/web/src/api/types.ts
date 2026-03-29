/** Types mirroring VCP API response shapes. */

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

export type AdmissionMode = "open" | "approval" | "invite-only";

export type VoteCreation = "admin" | "members";

export interface Assembly {
  id: string;
  organizationId: string | null;
  name: string;
  config: GovernanceConfig;
  status: string;
  createdAt: string;
  admissionMode?: AdmissionMode;
  websiteUrl?: string | null;
  voteCreation?: VoteCreation;
}

export interface AssemblyRole {
  participantId: string;
  role: string;
  name: string | null;
  grantedAt: number;
}

export interface AssemblyProfile extends Assembly {
  owners: AssemblyRole[];
  admins: AssemblyRole[];
  memberCount: number;
}

export type ParticipantStatus = "active" | "inactive" | "sunset";

export interface GovernanceConfig {
  name: string;
  description: string;
  delegation: {
    candidacy: boolean;
    transferable: boolean;
  };
  ballot: {
    secret: boolean;
    liveResults: boolean;
    allowVoteChange: boolean;
    quorum: number;
    method: "majority" | "supermajority";
  };
  features: {
    communityNotes: boolean;
    predictions: boolean;
    surveys: boolean;
    scoring: boolean;
  };
  timeline: {
    deliberationDays: number;
    curationDays: number;
    votingDays: number;
  };
}

export interface Participant {
  id: string;
  name: string;
  handle?: string | null;
  status?: ParticipantStatus;
  registeredAt?: string;
}

export interface VotingEvent {
  id: string;
  title: string;
  description: string;
  issueIds: string[];
  issues?: Issue[];
  eligibleParticipantIds: string[];
  timeline: {
    deliberationStart: string;
    votingStart: string;
    votingEnd: string;
  };
  createdBy?: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  topicId: string | null;
  choices?: string[];
  cancelled?: boolean;
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
  issueScope?: string | null;
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

export interface Survey {
  id: string;
  title: string;
  questions: SurveyQuestion[];
  topicIds: string[];
  schedule: number;
  closesAt: number;
  createdBy: string;
  hasResponded?: boolean;
  dismissed?: boolean;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  questionType: { type: string; [key: string]: unknown };
  topicIds: string[];
  tags: string[];
}

export interface SurveyResults {
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

// ---- Notifications ----

export type NotificationUrgency = "action" | "timely" | "info";

export interface Notification {
  id: string;
  userId: string;
  assemblyId: string;
  assemblyName?: string;
  type: string;
  urgency: NotificationUrgency;
  title: string;
  body: string | null;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
}

// ---- Join Requests ----

export interface JoinRequest {
  id: string;
  assemblyId: string;
  userId: string;
  userName: string;
  userHandle: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  assemblyName?: string;
}

// ---- Notification Preferences ----

export interface NotificationPreferences {
  notify_new_votes: "always" | "undelegated_only" | "never";
  notify_new_surveys: "true" | "false";
  notify_deadlines: "true" | "false";
  notify_results: "true" | "false";
  notify_channel: "email" | "sms" | "both" | "none";
  notify_admin_join_requests: "true" | "false";
  notify_admin_new_members: "true" | "false";
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

// ---- Proposals ----

export interface ProposalDraft {
  id: string;
  assemblyId: string;
  issueId: string;
  choiceKey?: string;
  authorId: string;
  title: string;
  markdown: string;
  assets: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Proposal {
  id: string;
  issueId: string;
  choiceKey?: string;
  authorId: string;
  title: string;
  currentVersion: number;
  endorsementCount: number;
  disputeCount: number;
  featured: boolean;
  status: "submitted" | "locked" | "withdrawn";
  submittedAt: number;
  lockedAt?: number;
  withdrawnAt?: number;
  content?: {
    markdown: string;
    assets: string[];
    contentHash: string;
    versionNumber: number;
  };
  versions?: Array<{
    versionNumber: number;
    contentHash: string;
    createdAt: number;
  }>;
}

export interface BookletPosition {
  featured: Proposal | null;
  all: Proposal[];
}

export interface BookletRecommendation {
  markdown?: string;
  contentHash: string;
  authorId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface BookletData {
  issueId: string;
  positions: Record<string, BookletPosition>;
  recommendation: BookletRecommendation | null;
}

// ---- Topic Queries ----

export interface TopicIssueItem {
  issue: Issue & { cancelled: boolean };
  event: { id: string; title: string; timeline: { deliberationStart: string; votingStart: string; votingEnd: string } };
}

export interface TopicDelegationItem {
  delegate: { id: string; name: string };
  /** Total weight: how many votes this delegate carries (self + all chain-resolved delegations). */
  weight: number;
}

// ---- Candidacies ----

export interface Candidacy {
  id: string;
  participantId: string;
  topicScope: string[];
  voteTransparencyOptIn: boolean;
  currentVersion: number;
  status: "active" | "withdrawn";
  declaredAt: number;
  withdrawnAt?: number;
  /** Website URL — available on list (from backend enrichment) and detail (from content). */
  websiteUrl?: string | null;
  /** Per-membership title (e.g., "Structural Engineer") — enriched from backend. */
  title?: string | null;
  content?: {
    markdown: string;
    assets: string[];
    contentHash: string;
    websiteUrl?: string | null;
    versionNumber: number;
  };
}

// ---- Entity Endorsements ----

export interface EndorsementCounts {
  endorse: number;
  dispute: number;
  my: "endorse" | "dispute" | null;
}

// ---- Community Notes ----

export interface CommunityNote {
  id: string;
  authorId: string;
  contentHash: string;
  target: {
    type: "proposal" | "candidacy" | "survey" | "community-note";
    id: string;
    versionNumber?: number;
  };
  endorsementCount: number;
  disputeCount: number;
  status: "proposed" | "withdrawn";
  createdAt: number;
  content?: {
    markdown: string;
    assets: string[];
  };
  visibility?: {
    visible: boolean;
    ratio: number;
    belowMinEvaluations: boolean;
  };
}

// ---- Scoring ----

export interface ScoringDimension {
  id: string;
  name: string;
  scale: { min: number; max: number; step?: number };
  weight: number;
}

export interface ScoringCategory {
  id: string;
  name: string;
  weight: number;
  dimensions: ScoringDimension[];
}

export interface ScoringRubric {
  categories: ScoringCategory[];
}

export interface ScoringEntry {
  id: string;
  title: string;
  description?: string;
}

export interface ScoringSettings {
  allowRevision: boolean;
  secretScores: boolean;
  normalizeScores: boolean;
  evaluatorAggregation: string;
  dimensionAggregation: string;
}

export interface ScoringEvent {
  id: string;
  title: string;
  description: string;
  entries: ScoringEntry[];
  rubric: ScoringRubric;
  panelMemberIds: string[] | null;
  timeline: {
    opensAt: string;
    closesAt: string;
  };
  settings: ScoringSettings;
  createdAt: string;
}

export interface ScorecardScore {
  dimensionId: string;
  score: number;
}

export interface Scorecard {
  id: string;
  scoringEventId: string;
  evaluatorId: string;
  entryId: string;
  scores: ScorecardScore[];
  submittedAt: string;
}

export interface ScoringDimensionResult {
  dimensionId: string;
  aggregatedScore: number;
}

export interface ScoringCategoryResult {
  categoryId: string;
  categoryScore: number;
  dimensions: ScoringDimensionResult[];
}

export interface ScoringEntryResult {
  entryId: string;
  rank: number;
  finalScore: number;
  categories: ScoringCategoryResult[];
}

export interface ScoringResult {
  entries: ScoringEntryResult[];
  eligibleCount: number;
  participatingCount: number;
  participationRate: number;
  computedAt: number;
}
