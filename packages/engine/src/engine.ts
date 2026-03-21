/**
 * @votiverse/engine — VotiverseEngine
 *
 * Orchestration layer that wires all packages into a coherent runtime.
 * Consumers interact with this API; the engine delegates to the appropriate package.
 */

import type {
  EventStore,
  ParticipantId,
  TopicId,
  IssueId,
  VotingEventId,
  PredictionId,
  SurveyId,
  Topic,
  Issue,
  VotingEvent,
  EventTimeline,
  VoteChoice,
  VotingEventCreatedEvent,
  VotingEventIssuePayload,
  TopicCreatedEvent,
  IssueCancelledEvent,
  TimeProvider,
} from "@votiverse/core";
import {
  InMemoryEventStore,
  createEvent,
  generateEventId,
  generateVotingEventId,
  generateIssueId,
  generateTopicId,
  now,
  systemTime,
  NotFoundError,
  GovernanceRuleViolation,
} from "@votiverse/core";
import type { GovernanceConfig, PresetName, ValidationResult } from "@votiverse/config";
import { getPreset, getPresetNames, validateConfig, deriveConfig } from "@votiverse/config";
import type { ConfigOverrides } from "@votiverse/config";
import { InvitationProvider } from "@votiverse/identity";
import type { IdentityProvider } from "@votiverse/identity";
import { DelegationService } from "@votiverse/delegation";
import type {
  CreateDelegationParams,
  RevokeDelegationParams,
  Delegation,
  DelegationChain,
  WeightDistribution,
  ConcentrationMetrics,
} from "@votiverse/delegation";
import { VotingService } from "@votiverse/voting";
import type { TallyResult, VoteRecord, ParticipationRecord } from "@votiverse/voting";
import { PredictionService } from "@votiverse/prediction";
import type {
  CommitPredictionParams,
  RecordOutcomeParams,
  Prediction,
  PredictionEvaluation,
  TrackRecord,
} from "@votiverse/prediction";
import { SurveyService } from "@votiverse/survey";
import type {
  CreateSurveyParams,
  SubmitResponseParams,
  Survey,
  SurveyResults,
  TrendData,
} from "@votiverse/survey";
import { ProposalService, CandidacyService, NoteService } from "@votiverse/content";
import type {
  ProposalMetadata,
  SubmitProposalParams,
  CreateProposalVersionParams,
  CandidacyMetadata,
  DeclareCandidacyParams,
  CreateCandidacyVersionParams,
  NoteMetadata,
  CreateNoteParams,
  NoteVisibility,
} from "@votiverse/content";
import type {
  CandidacyId,
  NoteId,
  NoteEvaluation,
  NoteTargetType,
  ProposalId,
  ProposalEvaluation,
} from "@votiverse/core";

// ---------------------------------------------------------------------------
// Engine initialization options
// ---------------------------------------------------------------------------

export interface EngineOptions {
  /** Governance configuration. */
  readonly config: GovernanceConfig;
  /** Event store implementation. Defaults to InMemoryEventStore. */
  readonly eventStore?: EventStore;
  /** Identity provider. Defaults to InvitationProvider. */
  readonly identityProvider?: IdentityProvider;
  /** Time provider for mockable time. Defaults to systemTime (Date.now). */
  readonly timeProvider?: TimeProvider;
}

// ---------------------------------------------------------------------------
// VotingEvent creation params
// ---------------------------------------------------------------------------

export interface CreateVotingEventParams {
  readonly title: string;
  readonly description: string;
  readonly issues: readonly CreateIssueParams[];
  readonly eligibleParticipantIds: readonly ParticipantId[];
  readonly timeline: EventTimeline;
}

export interface CreateIssueParams {
  readonly title: string;
  readonly description: string;
  readonly topicId: TopicId | null;
  /** Declared choices for multi-option ballots. Omit for binary for/against. */
  readonly choices?: readonly string[];
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * The Votiverse governance engine.
 *
 * Provides a domain-organized API that consumers interact with.
 * Delegates to the appropriate package for each operation.
 */
export class VotiverseEngine {
  private readonly eventStore: EventStore;
  private readonly governanceConfig: GovernanceConfig;
  private readonly identityProvider: IdentityProvider;
  private readonly delegationService: DelegationService;
  private readonly votingService: VotingService;
  private readonly predictionService: PredictionService;
  private readonly surveyService: SurveyService;
  private readonly proposalService: ProposalService;
  private readonly candidacyService: CandidacyService;
  private readonly noteService: NoteService;

  /** Injectable time source for testing. */
  readonly timeProvider: TimeProvider;

  /** In-memory state derived from events. */
  private readonly topics = new Map<TopicId, Topic>();
  private readonly topicAncestors = new Map<TopicId, TopicId[]>();
  private readonly votingEvents = new Map<VotingEventId, VotingEvent>();
  private readonly issues = new Map<IssueId, Issue>();
  private readonly cancelledIssues = new Set<IssueId>();

  constructor(options: EngineOptions) {
    this.governanceConfig = options.config;
    this.eventStore = options.eventStore ?? new InMemoryEventStore();
    this.timeProvider = options.timeProvider ?? systemTime;

    this.identityProvider = options.identityProvider ?? new InvitationProvider(this.eventStore);

    this.delegationService = new DelegationService(this.eventStore, this.governanceConfig);
    this.votingService = new VotingService(this.eventStore, this.governanceConfig);
    this.predictionService = new PredictionService(this.eventStore, this.governanceConfig);
    this.surveyService = new SurveyService(this.eventStore, this.governanceConfig, this.timeProvider);
    this.proposalService = new ProposalService(this.eventStore, this.timeProvider);
    this.candidacyService = new CandidacyService(this.eventStore, this.timeProvider);
    this.noteService = new NoteService(this.eventStore, this.governanceConfig, this.timeProvider);
  }

  /**
   * Rebuild internal state from the event store.
   * Call this after loading a persisted event store to restore
   * the engine's in-memory maps (topics, voting events, issues).
   */
  async rehydrate(): Promise<void> {
    const events = await this.eventStore.getAll();
    for (const event of events) {
      if (event.type === "TopicCreated") {
        const payload = event.payload as {
          topicId: TopicId;
          name: string;
          parentId: TopicId | null;
        };
        const topic: Topic = {
          id: payload.topicId,
          name: payload.name,
          parentId: payload.parentId,
        };
        this.topics.set(payload.topicId, topic);
        this.buildTopicAncestors(payload.topicId, payload.parentId);
      } else if (event.type === "VotingEventCreated") {
        const payload = event.payload as {
          votingEventId: VotingEventId;
          title: string;
          description: string;
          issues?: readonly VotingEventIssuePayload[];
          issueIds: readonly IssueId[];
          eligibleParticipantIds: readonly ParticipantId[];
          timeline: EventTimeline;
        };
        const votingEvent: VotingEvent = {
          id: payload.votingEventId,
          title: payload.title,
          description: payload.description,
          issueIds: payload.issueIds,
          eligibleParticipantIds: payload.eligibleParticipantIds,
          timeline: payload.timeline,
          createdAt: event.timestamp,
        };
        this.votingEvents.set(payload.votingEventId, votingEvent);

        // Rebuild issues from the full metadata when available (new events),
        // or fall back to minimal stubs for legacy events.
        if (payload.issues) {
          for (const issueMeta of payload.issues) {
            if (!this.issues.has(issueMeta.id)) {
              this.issues.set(issueMeta.id, {
                id: issueMeta.id,
                title: issueMeta.title,
                description: issueMeta.description,
                topicId: issueMeta.topicId,
                votingEventId: payload.votingEventId,
                ...(issueMeta.choices ? { choices: issueMeta.choices } : {}),
              });
            }
          }
        } else {
          for (const issueId of payload.issueIds) {
            if (!this.issues.has(issueId)) {
              this.issues.set(issueId, {
                id: issueId,
                title: "",
                description: "",
                topicId: null,
                votingEventId: payload.votingEventId,
              });
            }
          }
        }
      } else if (event.type === "IssueCancelled") {
        const payload = event.payload as { issueId: IssueId };
        this.cancelledIssues.add(payload.issueId);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Config API
  // -----------------------------------------------------------------------

  /** Configuration operations. */
  readonly config = {
    validate: (config: GovernanceConfig): ValidationResult => validateConfig(config),
    getPreset: (name: PresetName): GovernanceConfig => getPreset(name),
    getPresetNames: (): readonly PresetName[] => getPresetNames(),
    derive: (overrides: ConfigOverrides): GovernanceConfig =>
      deriveConfig(this.governanceConfig, overrides),
    getCurrent: (): GovernanceConfig => this.governanceConfig,
  };

  // -----------------------------------------------------------------------
  // Identity API
  // -----------------------------------------------------------------------

  /** Identity operations. */
  get identity() {
    const provider = this.identityProvider;
    return {
      getProvider: () => provider,
      getParticipant: (id: ParticipantId) => provider.getParticipant(id),
      listParticipants: () => provider.listParticipants(),
    };
  }

  // -----------------------------------------------------------------------
  // Topic API
  // -----------------------------------------------------------------------

  /** Topic operations. */
  readonly topics_api = {
    create: async (name: string, parentId?: TopicId): Promise<Topic> => {
      // Validate topic depth (max 2: root + one level of children)
      const MAX_TOPIC_DEPTH = 2;
      if (parentId) {
        const parentDepth = this.getTopicDepth(parentId);
        if (parentDepth + 1 > MAX_TOPIC_DEPTH) {
          throw new GovernanceRuleViolation(
            `Topic depth would exceed maximum of ${MAX_TOPIC_DEPTH}`,
            "TOPIC_DEPTH_EXCEEDED",
          );
        }
      }

      const topicId = generateTopicId();
      const topic: Topic = {
        id: topicId,
        name,
        parentId: parentId ?? null,
      };

      const event = createEvent<TopicCreatedEvent>(
        "TopicCreated",
        { topicId, name, parentId: parentId ?? null },
        generateEventId(),
        now(),
      );
      await this.eventStore.append(event);

      this.topics.set(topicId, topic);
      this.buildTopicAncestors(topicId, parentId ?? null);

      return topic;
    },
    get: (id: TopicId): Topic | undefined => this.topics.get(id),
    list: (): readonly Topic[] => [...this.topics.values()],
  };

  /** Returns the depth of a topic (1 for root, 2 for child of root, etc.). */
  private getTopicDepth(topicId: TopicId): number {
    let depth = 1;
    let current = this.topics.get(topicId);
    while (current?.parentId) {
      depth++;
      current = this.topics.get(current.parentId);
    }
    return depth;
  }

  private buildTopicAncestors(topicId: TopicId, parentId: TopicId | null): void {
    const ancestors: TopicId[] = [];
    let current = parentId;
    while (current !== null) {
      ancestors.push(current);
      const parent = this.topics.get(current);
      current = parent?.parentId ?? null;
    }
    this.topicAncestors.set(topicId, ancestors);
  }

  // -----------------------------------------------------------------------
  // VotingEvent API
  // -----------------------------------------------------------------------

  /** Voting event operations. */
  readonly events = {
    create: async (params: CreateVotingEventParams): Promise<VotingEvent> => {
      const votingEventId = generateVotingEventId();
      const issueIds: IssueId[] = [];
      const issuePayloads: VotingEventIssuePayload[] = [];

      for (const issueParams of params.issues) {
        const issueId = generateIssueId();
        issueIds.push(issueId);
        const issue: Issue = {
          id: issueId,
          title: issueParams.title,
          description: issueParams.description,
          topicId: issueParams.topicId,
          votingEventId,
          ...(issueParams.choices ? { choices: issueParams.choices } : {}),
        };
        this.issues.set(issueId, issue);

        issuePayloads.push({
          id: issueId,
          title: issueParams.title,
          description: issueParams.description,
          topicId: issueParams.topicId,
          ...(issueParams.choices ? { choices: issueParams.choices } : {}),
        });
      }

      const votingEvent: VotingEvent = {
        id: votingEventId,
        title: params.title,
        description: params.description,
        issueIds,
        eligibleParticipantIds: params.eligibleParticipantIds,
        timeline: params.timeline,
        createdAt: now(),
      };

      const event = createEvent<VotingEventCreatedEvent>(
        "VotingEventCreated",
        {
          votingEventId,
          title: params.title,
          description: params.description,
          issues: issuePayloads,
          issueIds,
          eligibleParticipantIds: params.eligibleParticipantIds,
          timeline: params.timeline,
        },
        generateEventId(),
        now(),
      );
      await this.eventStore.append(event);

      this.votingEvents.set(votingEventId, votingEvent);
      return votingEvent;
    },

    get: (id: VotingEventId): VotingEvent | undefined => this.votingEvents.get(id),

    getIssue: (id: IssueId): Issue | undefined => this.issues.get(id),

    listIssues: (): readonly Issue[] => [...this.issues.values()],

    list: (): readonly VotingEvent[] => [...this.votingEvents.values()],

    /** Whether an issue has been cancelled. */
    isIssueCancelled: (id: IssueId): boolean => this.cancelledIssues.has(id),

    /**
     * Cancel an issue during the deliberation phase.
     * Cancelled issues cannot receive votes. Active proposals are auto-withdrawn.
     */
    cancelIssue: async (issueId: IssueId, cancelledBy: ParticipantId, reason: string): Promise<void> => {
      const issue = this.issues.get(issueId);
      if (!issue) throw new NotFoundError("Issue", issueId);
      if (this.cancelledIssues.has(issueId)) {
        throw new GovernanceRuleViolation("Issue is already cancelled", "ISSUE_ALREADY_CANCELLED");
      }
      const votingEvent = this.votingEvents.get(issue.votingEventId);
      if (votingEvent) {
        const currentTime = this.timeProvider.now();
        if (currentTime >= votingEvent.timeline.votingStart) {
          throw new GovernanceRuleViolation(
            "Cannot cancel an issue after voting has started",
            "CANCELLATION_TOO_LATE",
          );
        }
      }

      const event = createEvent<IssueCancelledEvent>(
        "IssueCancelled",
        { issueId, votingEventId: issue.votingEventId, cancelledBy, reason },
        generateEventId(),
        now(),
      );
      await this.eventStore.append(event);
      this.cancelledIssues.add(issueId);

      // Auto-withdraw active proposals for this issue
      const proposals = await this.proposalService.listByIssue(issueId);
      for (const proposal of proposals) {
        if (proposal.status === "submitted") {
          await this.proposalService.withdraw(proposal.id, cancelledBy as string);
        }
      }
    },
  };

  /**
   * Inject issue data during rehydration (when issue details are stored
   * outside the event log).
   */
  injectIssue(issue: Issue): void {
    this.issues.set(issue.id, issue);
  }

  // -----------------------------------------------------------------------
  // Delegation API
  // -----------------------------------------------------------------------

  /** Delegation operations. */
  readonly delegation = {
    create: (params: CreateDelegationParams): Promise<Delegation> =>
      this.delegationService.create(params),

    revoke: (params: RevokeDelegationParams): Promise<void> =>
      this.delegationService.revoke(params),

    listActive: (sourceId?: ParticipantId) => this.delegationService.listActive(sourceId),

    resolve: (participantId: ParticipantId, issueId: IssueId): Promise<DelegationChain> => {
      const issue = this.issues.get(issueId);
      if (!issue) {
        throw new NotFoundError("Issue", issueId);
      }
      return this.delegationService.resolveChain(
        participantId,
        issueId,
        issue.topicId,
        this.topicAncestors,
      );
    },

    weights: (issueId: IssueId): Promise<WeightDistribution> => {
      const issue = this.issues.get(issueId);
      if (!issue) {
        throw new NotFoundError("Issue", issueId);
      }
      const votingEvent = this.votingEvents.get(issue.votingEventId);
      if (!votingEvent) {
        throw new NotFoundError("VotingEvent", issue.votingEventId);
      }
      return this.delegationService.computeWeights(
        issueId,
        issue.topicId,
        new Set(votingEvent.eligibleParticipantIds),
        this.topicAncestors,
      );
    },

    concentration: (issueId: IssueId): Promise<ConcentrationMetrics> => {
      const issue = this.issues.get(issueId);
      if (!issue) {
        throw new NotFoundError("Issue", issueId);
      }
      const votingEvent = this.votingEvents.get(issue.votingEventId);
      if (!votingEvent) {
        throw new NotFoundError("VotingEvent", issue.votingEventId);
      }
      return this.delegationService.computeConcentration(
        issueId,
        issue.topicId,
        new Set(votingEvent.eligibleParticipantIds),
        this.topicAncestors,
      );
    },
  };

  // -----------------------------------------------------------------------
  // Voting API
  // -----------------------------------------------------------------------

  /** Voting operations. */
  readonly voting = {
    cast: async (participantId: ParticipantId, issueId: IssueId, choice: VoteChoice): Promise<void> => {
      // Reject votes on cancelled issues
      if (this.cancelledIssues.has(issueId)) {
        throw new GovernanceRuleViolation("Issue has been cancelled", "ISSUE_CANCELLED");
      }
      const issue = this.issues.get(issueId);
      // Timeline enforcement: reject votes outside the voting window
      if (issue) {
        const votingEvent = this.votingEvents.get(issue.votingEventId);
        if (votingEvent) {
          const currentTime = this.timeProvider.now();
          if (currentTime < votingEvent.timeline.votingStart) {
            throw new GovernanceRuleViolation(
              "Voting has not started yet",
              "VOTING_NOT_OPEN",
            );
          }
          if (currentTime >= votingEvent.timeline.votingEnd) {
            throw new GovernanceRuleViolation(
              "Voting has closed",
              "VOTING_CLOSED",
            );
          }
        }
      }
      // Lock proposals on first vote (idempotent — lockForIssue returns 0 if already locked)
      await this.proposalService.lockForIssue(issueId);

      return this.votingService.cast({
        participantId,
        issueId,
        choice,
        issueChoices: issue?.choices,
      });
    },

    getVotes: (issueId: IssueId): Promise<readonly VoteRecord[]> =>
      this.votingService.getVotes(issueId),

    tally: (issueId: IssueId): Promise<TallyResult> => {
      const issue = this.issues.get(issueId);
      if (!issue) {
        throw new NotFoundError("Issue", issueId);
      }
      const votingEvent = this.votingEvents.get(issue.votingEventId);
      if (!votingEvent) {
        throw new NotFoundError("VotingEvent", issue.votingEventId);
      }
      return this.votingService.tally(
        issueId,
        issue.topicId,
        new Set(votingEvent.eligibleParticipantIds),
        this.topicAncestors,
      );
    },

    /** Compute participation records for all eligible participants on an issue. */
    participation: (issueId: IssueId): Promise<readonly ParticipationRecord[]> => {
      const issue = this.issues.get(issueId);
      if (!issue) {
        throw new NotFoundError("Issue", issueId);
      }
      const votingEvent = this.votingEvents.get(issue.votingEventId);
      if (!votingEvent) {
        throw new NotFoundError("VotingEvent", issue.votingEventId);
      }
      return this.votingService.participation(
        issueId,
        issue.topicId,
        new Set(votingEvent.eligibleParticipantIds),
        this.topicAncestors,
      );
    },
  };

  // -----------------------------------------------------------------------
  // Prediction API
  // -----------------------------------------------------------------------

  /** Prediction operations. */
  readonly prediction = {
    commit: (params: CommitPredictionParams): Promise<Prediction> =>
      this.predictionService.commit(params),

    recordOutcome: (params: RecordOutcomeParams) => this.predictionService.recordOutcome(params),

    evaluate: (
      predictionId: PredictionId,
    ): Promise<PredictionEvaluation> => this.predictionService.evaluate(predictionId),

    evaluateFromTrend: (
      predictionId: PredictionId,
      trendScore: number,
      pollId: string,
      notes?: string,
    ) => this.predictionService.evaluateFromTrend(predictionId, trendScore, pollId, notes),

    trackRecord: (participantId: ParticipantId): Promise<TrackRecord> =>
      this.predictionService.trackRecord(participantId),

    get: (predictionId: PredictionId) =>
      this.predictionService.getPrediction(predictionId),

    getByParticipant: (participantId: ParticipantId) =>
      this.predictionService.getPredictionsByParticipant(participantId),
  };

  // -----------------------------------------------------------------------
  // Survey API
  // -----------------------------------------------------------------------

  /** Survey operations. */
  readonly surveys = {
    create: (params: CreateSurveyParams): Promise<Survey> => this.surveyService.create(params),

    respond: (params: SubmitResponseParams) => this.surveyService.respond(params),

    results: (
      surveyId: SurveyId,
      eligibleCount: number,
    ): Promise<SurveyResults> => this.surveyService.results(surveyId, eligibleCount),

    trends: (topicId: TopicId, eligibleCount: number): Promise<TrendData> =>
      this.surveyService.trends(topicId, eligibleCount),

    get: (surveyId: SurveyId) => this.surveyService.getSurvey(surveyId),

    list: () => this.surveyService.getAllSurveys(),

    hasResponded: (surveyId: SurveyId, participantId: ParticipantId): Promise<boolean> =>
      this.surveyService.hasResponded(surveyId, participantId),
  };

  // -----------------------------------------------------------------------
  // Content API (proposals, candidacies, community notes)
  // -----------------------------------------------------------------------

  /** Proposal operations. */
  readonly proposals = {
    /**
     * Submit a proposal. Enforces the deliberation window:
     * rejected if now >= votingStart for the linked issue.
     */
    submit: async (params: SubmitProposalParams): Promise<ProposalMetadata> => {
      const issue = this.issues.get(params.issueId);
      if (!issue) {
        throw new NotFoundError("Issue", params.issueId);
      }
      const votingEvent = this.votingEvents.get(issue.votingEventId);
      if (votingEvent) {
        const currentTime = this.timeProvider.now();
        if (currentTime >= votingEvent.timeline.votingStart) {
          throw new GovernanceRuleViolation(
            "Cannot submit proposals after voting has started",
            "DELIBERATION_CLOSED",
          );
        }
      }
      return this.proposalService.submit(params);
    },

    /**
     * Create a new version of a submitted proposal.
     * Enforces the deliberation window.
     */
    createVersion: async (params: CreateProposalVersionParams): Promise<ProposalMetadata> => {
      // Check timeline via the proposal's issue
      const proposal = await this.proposalService.getById(params.proposalId);
      if (proposal) {
        const issue = this.issues.get(proposal.issueId);
        if (issue) {
          const votingEvent = this.votingEvents.get(issue.votingEventId);
          if (votingEvent && this.timeProvider.now() >= votingEvent.timeline.votingStart) {
            throw new GovernanceRuleViolation(
              "Cannot version proposals after voting has started",
              "DELIBERATION_CLOSED",
            );
          }
        }
      }
      return this.proposalService.createVersion(params);
    },

    withdraw: (proposalId: ProposalId, authorId: string): Promise<void> =>
      this.proposalService.withdraw(proposalId, authorId),

    evaluate: (proposalId: ProposalId, participantId: ParticipantId, evaluation: ProposalEvaluation): Promise<void> =>
      this.proposalService.evaluate(proposalId, participantId, evaluation),

    get: (proposalId: ProposalId): Promise<ProposalMetadata | undefined> =>
      this.proposalService.getById(proposalId),

    listByIssue: (issueId: IssueId): Promise<ProposalMetadata[]> =>
      this.proposalService.listByIssue(issueId),
  };

  /** Delegate candidacy operations. */
  readonly candidacies = {
    declare: (params: DeclareCandidacyParams): Promise<CandidacyMetadata> =>
      this.candidacyService.declare(params),

    createVersion: (params: CreateCandidacyVersionParams): Promise<CandidacyMetadata> =>
      this.candidacyService.createVersion(params),

    withdraw: (candidacyId: CandidacyId, participantId: ParticipantId): Promise<void> =>
      this.candidacyService.withdraw(candidacyId, participantId),

    get: (candidacyId: CandidacyId): Promise<CandidacyMetadata | undefined> =>
      this.candidacyService.getById(candidacyId),

    getByParticipant: (participantId: ParticipantId): Promise<CandidacyMetadata | undefined> =>
      this.candidacyService.getByParticipant(participantId),
  };

  /** Community note operations. */
  readonly notes = {
    create: (params: CreateNoteParams): Promise<NoteMetadata> =>
      this.noteService.create(params),

    evaluate: (noteId: NoteId, participantId: ParticipantId, evaluation: NoteEvaluation): Promise<void> =>
      this.noteService.evaluate(noteId, participantId, evaluation),

    withdraw: (noteId: NoteId, authorId: ParticipantId): Promise<void> =>
      this.noteService.withdraw(noteId, authorId),

    get: (noteId: NoteId): Promise<NoteMetadata | undefined> =>
      this.noteService.getById(noteId),

    listByTarget: (targetType: NoteTargetType, targetId: string): Promise<NoteMetadata[]> =>
      this.noteService.listByTarget(targetType, targetId),

    computeVisibility: (note: NoteMetadata): NoteVisibility =>
      this.noteService.computeVisibility(note),
  };

  // -----------------------------------------------------------------------
  // Event Store access
  // -----------------------------------------------------------------------

  /** Direct access to the event store (for debugging/auditing). */
  getEventStore(): EventStore {
    return this.eventStore;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new VotiverseEngine with the given configuration.
 */
export function createEngine(options: EngineOptions): VotiverseEngine {
  return new VotiverseEngine(options);
}
