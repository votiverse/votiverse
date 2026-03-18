/**
 * @votiverse/awareness — Type definitions
 *
 * The awareness layer is read-only. It queries state produced by
 * other packages and delivers contextual findings.
 *
 * All query results support progressive disclosure via a `detail`
 * level: "summary" for quick checks, "full" for investigation.
 */

import type { ParticipantId, IssueId, TopicId, PredictionId, ProposalId, CandidacyId, Timestamp } from "@votiverse/core";
import type { EvaluationStatus } from "@votiverse/prediction";

// ---------------------------------------------------------------------------
// Detail level (progressive disclosure)
// ---------------------------------------------------------------------------

export type DetailLevel = "summary" | "full";

// ---------------------------------------------------------------------------
// Concentration alerts
// ---------------------------------------------------------------------------

export interface ConcentrationAlert {
  /** Participant who holds concentrated weight. */
  readonly delegateId: ParticipantId;
  /** Their current effective weight. */
  readonly weight: number;
  /** Weight as a fraction of total eligible participants. */
  readonly weightFraction: number;
  /** Number of participants in their delegation subtree. */
  readonly subtreeSize: number;
  /** The configured threshold that was exceeded. */
  readonly threshold: number;
}

export interface ConcentrationReport {
  readonly issueId: IssueId;
  readonly alerts: readonly ConcentrationAlert[];
  /** Gini coefficient of the weight distribution. */
  readonly giniCoefficient: number;
  /** Maximum weight held by any single participant. */
  readonly maxWeight: number;
  /** Whether any alerts were triggered. */
  readonly hasAlerts: boolean;
}

// ---------------------------------------------------------------------------
// Delegate profile / track record
// ---------------------------------------------------------------------------

export interface DelegateProfile {
  readonly delegateId: ParticipantId;
  /** Number of participants currently delegating to this person (directly). */
  readonly currentDelegatorCount: number;
  /** Topics where this delegate is most active. */
  readonly activeTopics: readonly TopicId[];
  /** Prediction track record. */
  readonly predictionAccuracy: number;
  readonly predictionCount: number;
  readonly predictionsByStatus: Readonly<Partial<Record<EvaluationStatus, number>>>;
  /** Voting participation rate. */
  readonly votingParticipationRate: number;
  readonly totalVotesEligible: number;
  readonly totalVotesCast: number;
  /** Formal candidacy profile, if declared. */
  readonly candidacy?: CandidacySummary;
}

/** Summary of a delegate's formal candidacy for inclusion in profiles. */
export interface CandidacySummary {
  readonly id: CandidacyId;
  readonly currentVersion: number;
  readonly topicScope: readonly TopicId[];
  readonly voteTransparencyOptIn: boolean;
  readonly declaredAt: Timestamp;
  /** Number of community notes on this candidacy. */
  readonly noteCount: number;
  /** Notes meeting the visibility threshold. */
  readonly endorsedNoteCount: number;
}

// ---------------------------------------------------------------------------
// Engagement prompts
// ---------------------------------------------------------------------------

export type PromptReason =
  | "close-vote"
  | "prediction-mismatch"
  | "delegate-behavior-anomaly"
  | "concentration-alert"
  | "chain-changed"
  | "delegate-position-changed"
  | "new-community-note"
  | "proposal-updated"
  | "delegate-vote-mismatch";

export interface EngagementPrompt {
  readonly participantId: ParticipantId;
  readonly issueId: IssueId;
  readonly reason: PromptReason;
  readonly message: string;
  /** Severity: "info" for gentle nudges, "warning" for important flags. */
  readonly severity: "info" | "warning";
}

// ---------------------------------------------------------------------------
// Personal voting history
// ---------------------------------------------------------------------------

export interface VotingHistoryEntry {
  readonly issueId: IssueId;
  readonly issueTitle: string;
  readonly votedDirectly: boolean;
  /** If delegated: the immediate delegate. */
  readonly delegateId?: ParticipantId;
  /** If delegated: the terminal voter. */
  readonly terminalVoterId?: ParticipantId;
  /** How the effective vote was cast. */
  readonly effectiveChoice?: string;
  /** Whether the proposal passed. */
  readonly proposalPassed?: boolean;
  /** Prediction evaluations associated with this issue. */
  readonly predictions: readonly PredictionSummary[];
}

export interface PredictionSummary {
  readonly predictionId: PredictionId;
  readonly variable: string;
  readonly status: EvaluationStatus;
  readonly accuracy: number;
}

export interface VotingHistory {
  readonly participantId: ParticipantId;
  readonly entries: readonly VotingHistoryEntry[];
  readonly totalDirect: number;
  readonly totalDelegated: number;
}

// ---------------------------------------------------------------------------
// Historical context
// ---------------------------------------------------------------------------

export interface HistoricalContext {
  readonly issueId: IssueId;
  readonly topicIds: readonly TopicId[];
  /** Past decisions on related topics. */
  readonly relatedDecisions: readonly RelatedDecision[];
  /** Survey trend data for the issue's topics. */
  readonly surveyTrends: readonly TopicTrend[];
  /** Proposals submitted for this issue. */
  readonly proposals: readonly ProposalSummary[];
}

/** Summary of a proposal for inclusion in historical context. */
export interface ProposalSummary {
  readonly id: ProposalId;
  readonly authorId: ParticipantId;
  readonly title: string;
  readonly choiceKey?: string;
  readonly version: number;
  readonly noteCount: number;
  readonly endorsedNoteCount: number;
  readonly predictionCount: number;
}

export interface RelatedDecision {
  readonly issueId: IssueId;
  readonly issueTitle: string;
  readonly outcome: string;
  readonly predictions: readonly PredictionSummary[];
  readonly decisionDate: Timestamp;
}

export interface TopicTrend {
  readonly topicId: TopicId;
  readonly direction: string;
  readonly latestScore: number;
  readonly dataPoints: number;
}
