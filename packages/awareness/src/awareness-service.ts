/**
 * @votiverse/awareness — AwarenessService
 *
 * Read-only service that queries state from delegation, voting,
 * prediction, and survey packages to deliver contextual findings.
 *
 * This package never modifies engine state. It is safe to add,
 * remove, or modify awareness features without risk to governance logic.
 */

import type { EventStore, ParticipantId, IssueId, TopicId, Timestamp, VoteCastEvent } from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import {
  buildActiveDelegations,
  getDirectVoters,
  buildDelegationGraph,
  computeWeights,
  resolveChain,
  computeConcentrationMetrics,
} from "@votiverse/delegation";
import type { DelegationChain } from "@votiverse/delegation";
import { PredictionService } from "@votiverse/prediction";
import { SurveyService } from "@votiverse/survey";
import { ProposalService, CandidacyService, NoteService } from "@votiverse/content";
import type {
  ConcentrationReport,
  ConcentrationAlert,
  CandidacySummary,
  DelegateProfile,
  EngagementPrompt,
  ProposalSummary,
  VotingHistory,
  VotingHistoryEntry,
  PredictionSummary,
  HistoricalContext,
  RelatedDecision,
  TopicTrend,
} from "./types.js";

// ---------------------------------------------------------------------------
// Issue context (passed in by the engine, since awareness is read-only)
// ---------------------------------------------------------------------------

export interface IssueContext {
  readonly issueId: IssueId;
  readonly issueTitle: string;
  readonly topicId: TopicId | null;
  readonly eligibleParticipantIds: readonly ParticipantId[];
  readonly topicAncestors: ReadonlyMap<TopicId, readonly TopicId[]>;
}

/**
 * Read-only governance awareness service.
 */
export class AwarenessService {
  private readonly predictionService: PredictionService;
  private readonly surveyService: SurveyService;
  private readonly proposalService: ProposalService;
  private readonly candidacyService: CandidacyService;
  private readonly noteService: NoteService;

  constructor(
    private readonly eventStore: EventStore,
    private readonly config: GovernanceConfig,
  ) {
    this.predictionService = new PredictionService(eventStore, config);
    this.surveyService = new SurveyService(eventStore, config);
    // Content services are read-only from awareness perspective —
    // used to query candidacy profiles, proposals, and note counts.
    const readOnlyTimeProvider = { now: () => Date.now() as Timestamp };
    this.proposalService = new ProposalService(eventStore, readOnlyTimeProvider);
    this.candidacyService = new CandidacyService(eventStore, readOnlyTimeProvider);
    this.noteService = new NoteService(eventStore, config, readOnlyTimeProvider);
  }

  // -----------------------------------------------------------------------
  // Concentration monitoring
  // -----------------------------------------------------------------------

  /**
   * Compute concentration report for an issue.
   * Alerts when any delegate's weight exceeds the configured threshold.
   */
  async concentration(ctx: IssueContext): Promise<ConcentrationReport> {
    const delegations = await buildActiveDelegations(this.eventStore);
    const graph = buildDelegationGraph(ctx.issueId, ctx.topicId, delegations, ctx.topicAncestors);
    const voters = await getDirectVoters(this.eventStore, ctx.issueId);
    const eligible = new Set(ctx.eligibleParticipantIds);
    const weightDist = computeWeights(graph, voters, eligible);
    const metrics = computeConcentrationMetrics(weightDist, graph, voters);

    const threshold = this.config.thresholds.concentrationAlertThreshold;
    const alerts: ConcentrationAlert[] = [];

    for (const [pid, weight] of weightDist.weights) {
      if (weight <= 0) continue;
      const fraction = eligible.size > 0 ? weight / eligible.size : 0;
      if (fraction >= threshold) {
        alerts.push({
          delegateId: pid,
          weight,
          weightFraction: fraction,
          subtreeSize: weight, // weight = subtree size for voters
          threshold,
        });
      }
    }

    return {
      issueId: ctx.issueId,
      alerts,
      giniCoefficient: metrics.giniCoefficient,
      maxWeight: metrics.maxWeight,
      hasAlerts: alerts.length > 0,
    };
  }

  // -----------------------------------------------------------------------
  // Chain resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve the delegation chain for a participant on an issue.
   */
  async chain(participantId: ParticipantId, ctx: IssueContext): Promise<DelegationChain> {
    const delegations = await buildActiveDelegations(this.eventStore);
    const graph = buildDelegationGraph(ctx.issueId, ctx.topicId, delegations, ctx.topicAncestors);
    const voters = await getDirectVoters(this.eventStore, ctx.issueId);
    return resolveChain(participantId, graph, voters);
  }

  // -----------------------------------------------------------------------
  // Delegate profile
  // -----------------------------------------------------------------------

  /**
   * Build a profile for a delegate: delegation stats, prediction track record,
   * voting participation.
   */
  async delegateProfile(
    delegateId: ParticipantId,
    allIssueContexts: readonly IssueContext[],
  ): Promise<DelegateProfile> {
    // Current delegator count
    const delegations = await buildActiveDelegations(this.eventStore);
    const currentDelegators = delegations.filter((d) => d.targetId === delegateId);

    // Active topics
    const topicSet = new Set<TopicId>();
    for (const d of currentDelegators) {
      for (const t of d.topicScope) {
        topicSet.add(t);
      }
    }

    // Prediction track record
    const trackRecord = await this.predictionService.trackRecord(delegateId);

    // Voting participation
    const allVoteEvents = await this.eventStore.query({ types: ["VoteCast"] });
    const delegateVotes = allVoteEvents.filter(
      (e) => (e as VoteCastEvent).payload.participantId === delegateId,
    );
    const eligibleIssueCount = allIssueContexts.filter((ctx) =>
      ctx.eligibleParticipantIds.includes(delegateId),
    ).length;

    // Candidacy profile (if declared)
    let candidacy: CandidacySummary | undefined;
    const candidacyMetadata = await this.candidacyService.getByParticipant(delegateId);
    if (candidacyMetadata) {
      const notes = await this.noteService.listByTarget("candidacy", candidacyMetadata.id);
      const endorsedNotes = notes.filter((n) => {
        const vis = this.noteService.computeVisibility(n);
        return vis.visible;
      });
      candidacy = {
        id: candidacyMetadata.id,
        currentVersion: candidacyMetadata.currentVersion,
        topicScope: candidacyMetadata.topicScope,
        voteTransparencyOptIn: candidacyMetadata.voteTransparencyOptIn,
        declaredAt: candidacyMetadata.declaredAt,
        noteCount: notes.length,
        endorsedNoteCount: endorsedNotes.length,
      };
    }

    return {
      delegateId,
      currentDelegatorCount: currentDelegators.length,
      activeTopics: [...topicSet],
      predictionAccuracy: trackRecord.averageAccuracy,
      predictionCount: trackRecord.totalPredictions,
      predictionsByStatus: trackRecord.byStatus,
      votingParticipationRate:
        eligibleIssueCount > 0 ? delegateVotes.length / eligibleIssueCount : 0,
      totalVotesEligible: eligibleIssueCount,
      totalVotesCast: delegateVotes.length,
      candidacy,
    };
  }

  // -----------------------------------------------------------------------
  // Engagement prompts
  // -----------------------------------------------------------------------

  /**
   * Generate engagement prompts for a participant on an issue.
   * Returns prompts when actionable conditions are detected.
   */
  async prompts(
    participantId: ParticipantId,
    ctx: IssueContext,
  ): Promise<readonly EngagementPrompt[]> {
    const prompts: EngagementPrompt[] = [];

    // Check if participant has delegated (not voted directly)
    const voters = await getDirectVoters(this.eventStore, ctx.issueId);
    if (voters.has(participantId)) {
      return []; // Already voted directly, no prompts needed
    }

    // Get chain
    const delegations = await buildActiveDelegations(this.eventStore);
    const graph = buildDelegationGraph(ctx.issueId, ctx.topicId, delegations, ctx.topicAncestors);
    const chain = resolveChain(participantId, graph, voters);

    if (!chain.terminalVoter) {
      // No one is voting on their behalf — prompt to vote
      if (chain.chain.length > 1) {
        prompts.push({
          participantId,
          issueId: ctx.issueId,
          reason: "delegate-behavior-anomaly",
          message: "Your delegation chain does not reach a voter. Consider voting directly.",
          severity: "warning",
        });
      }
      return prompts;
    }

    // Concentration check
    const concentration = await this.concentration(ctx);
    const terminalAlert = concentration.alerts.find((a) => a.delegateId === chain.terminalVoter);
    if (terminalAlert) {
      prompts.push({
        participantId,
        issueId: ctx.issueId,
        reason: "concentration-alert",
        message: `Your terminal voter holds ${terminalAlert.weight} votes (${(terminalAlert.weightFraction * 100).toFixed(0)}% of eligible participants). Consider voting directly.`,
        severity: "warning",
      });
    }

    // Close vote check
    const eligible = new Set(ctx.eligibleParticipantIds);
    const weightDist = computeWeights(graph, voters, eligible);
    if (weightDist.totalWeight > 0) {
      const voteCounts = await this.getVoteCounts(ctx.issueId);
      if (voteCounts.size >= 2) {
        const sorted = [...voteCounts.values()].sort((a, b) => b - a);
        if (sorted.length >= 2) {
          const margin = (sorted[0]! - sorted[1]!) / weightDist.totalWeight;
          if (margin < 0.1) {
            prompts.push({
              participantId,
              issueId: ctx.issueId,
              reason: "close-vote",
              message: "This vote is very close. Your direct vote could make a difference.",
              severity: "info",
            });
          }
        }
      }
    }

    return prompts;
  }

  // -----------------------------------------------------------------------
  // Personal voting history
  // -----------------------------------------------------------------------

  /**
   * Compile the retrospective record of a participant's voting history.
   */
  async votingHistory(
    participantId: ParticipantId,
    issueContexts: readonly IssueContext[],
  ): Promise<VotingHistory> {
    const entries: VotingHistoryEntry[] = [];

    for (const ctx of issueContexts) {
      if (!ctx.eligibleParticipantIds.includes(participantId)) continue;

      const voters = await getDirectVoters(this.eventStore, ctx.issueId);
      const votedDirectly = voters.has(participantId);

      let delegateId: ParticipantId | undefined;
      let terminalVoterId: ParticipantId | undefined;

      if (!votedDirectly) {
        const delegations = await buildActiveDelegations(this.eventStore);
        const graph = buildDelegationGraph(
          ctx.issueId,
          ctx.topicId,
          delegations,
          ctx.topicAncestors,
        );
        const chain = resolveChain(participantId, graph, voters);
        if (chain.chain.length > 1) {
          delegateId = chain.chain[1]; // immediate delegate
          terminalVoterId = chain.terminalVoter ?? undefined;
        }
      }

      // Get the effective vote choice
      const effectiveChoice = await this.getEffectiveChoice(
        votedDirectly ? participantId : (terminalVoterId ?? participantId),
        ctx.issueId,
      );

      // Get prediction summaries for this issue
      const predictions = await this.getPredictionSummariesForIssue(ctx.issueId);

      entries.push({
        issueId: ctx.issueId,
        issueTitle: ctx.issueTitle,
        votedDirectly,
        delegateId,
        terminalVoterId,
        effectiveChoice: effectiveChoice ?? undefined,
        predictions,
      });
    }

    const totalDirect = entries.filter((e) => e.votedDirectly).length;
    const totalDelegated = entries.filter((e) => !e.votedDirectly).length;

    return { participantId, entries, totalDirect, totalDelegated };
  }

  // -----------------------------------------------------------------------
  // Historical context
  // -----------------------------------------------------------------------

  /**
   * Retrieve relevant past decisions, predictions, and poll trends for an issue's topics.
   */
  async context(
    ctx: IssueContext,
    pastIssueContexts: readonly IssueContext[],
  ): Promise<HistoricalContext> {
    const relatedDecisions: RelatedDecision[] = [];

    for (const pastCtx of pastIssueContexts) {
      if (pastCtx.issueId === ctx.issueId) continue;
      // Check if topics overlap
      if (ctx.topicId === null || pastCtx.topicId !== ctx.topicId) continue;

      const predictions = await this.getPredictionSummariesForIssue(pastCtx.issueId);

      relatedDecisions.push({
        issueId: pastCtx.issueId,
        issueTitle: pastCtx.issueTitle,
        outcome: "completed", // simplified for now
        predictions,
        decisionDate: 0 as Timestamp,
      });
    }

    // Poll trends
    const surveyTrends: TopicTrend[] = [];
    if (this.config.features.surveys && ctx.topicId !== null) {
      try {
        const trend = await this.surveyService.trends(
          ctx.topicId,
          ctx.eligibleParticipantIds.length,
        );
        if (trend.points.length > 0) {
          const latest = trend.points[trend.points.length - 1]!;
          surveyTrends.push({
            topicId: ctx.topicId,
            direction: trend.direction,
            latestScore: latest.score,
            dataPoints: trend.points.length,
          });
        }
      } catch {
        // Polls may not be available for this topic
      }
    }

    // Proposal summaries for this issue
    const proposalSummaries = await this.getProposalSummariesForIssue(ctx.issueId);

    return {
      issueId: ctx.issueId,
      topicId: ctx.topicId,
      relatedDecisions,
      surveyTrends,
      proposals: proposalSummaries,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async getVoteCounts(issueId: IssueId): Promise<Map<string, number>> {
    const events = await this.eventStore.query({ types: ["VoteCast"] });
    const counts = new Map<string, number>();
    for (const event of events) {
      const e = event as VoteCastEvent;
      if (e.payload.issueId === issueId) {
        const choice =
          typeof e.payload.choice === "string" ? e.payload.choice : e.payload.choice.join(",");
        counts.set(choice, (counts.get(choice) ?? 0) + 1);
      }
    }
    return counts;
  }

  private async getEffectiveChoice(
    participantId: ParticipantId,
    issueId: IssueId,
  ): Promise<string | null> {
    const events = await this.eventStore.query({ types: ["VoteCast"] });
    let latest: string | null = null;
    for (const event of events) {
      const e = event as VoteCastEvent;
      if (e.payload.issueId === issueId && e.payload.participantId === participantId) {
        latest =
          typeof e.payload.choice === "string" ? e.payload.choice : e.payload.choice.join(",");
      }
    }
    return latest;
  }

  private async getPredictionSummariesForIssue(
    issueId: IssueId,
  ): Promise<readonly PredictionSummary[]> {
    // Predictions are linked to proposals, which are linked to issues.
    // Walk the chain: issue → proposals → predictions.
    const proposals = await this.proposalService.listByIssue(issueId);
    const summaries: PredictionSummary[] = [];

    for (const proposal of proposals) {
      // Query predictions by proposalId
      const events = await this.eventStore.query({ types: ["PredictionCommitted"] });
      for (const event of events) {
        if (event.type === "PredictionCommitted" && event.payload.proposalId === proposal.id) {
          try {
            const evaluation = await this.predictionService.evaluate(event.payload.predictionId);
            summaries.push({
              predictionId: event.payload.predictionId,
              variable: (event.payload.predictionData as Record<string, unknown>).variable as string ?? "unknown",
              status: evaluation.status,
              accuracy: evaluation.accuracy,
            });
          } catch {
            // Prediction may not be evaluable yet
          }
        }
      }
    }

    return summaries;
  }

  private async getProposalSummariesForIssue(
    issueId: IssueId,
  ): Promise<readonly ProposalSummary[]> {
    const proposals = await this.proposalService.listByIssue(issueId);
    const summaries: ProposalSummary[] = [];

    for (const proposal of proposals) {
      const notes = await this.noteService.listByTarget("proposal", proposal.id);
      const endorsedNotes = notes.filter((n) => {
        const vis = this.noteService.computeVisibility(n);
        return vis.visible;
      });

      // Count predictions linked to this proposal
      const predEvents = await this.eventStore.query({ types: ["PredictionCommitted"] });
      const predCount = predEvents.filter(
        (e) => e.type === "PredictionCommitted" && e.payload.proposalId === proposal.id,
      ).length;

      summaries.push({
        id: proposal.id,
        authorId: proposal.authorId,
        title: proposal.title,
        choiceKey: proposal.choiceKey,
        version: proposal.currentVersion,
        noteCount: notes.length,
        endorsedNoteCount: endorsedNotes.length,
        predictionCount: predCount,
      });
    }

    return summaries;
  }
}
