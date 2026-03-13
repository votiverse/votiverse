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
  PollId,
  Topic,
  Issue,
  VotingEvent,
  EventTimeline,
  VoteChoice,
  VotingEventCreatedEvent,
  TopicCreatedEvent,
} from "@votiverse/core";
import {
  InMemoryEventStore,
  createEvent,
  generateEventId,
  generateVotingEventId,
  generateIssueId,
  generateTopicId,
  now,
  NotFoundError,
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
import type { TallyResult, VoteRecord } from "@votiverse/voting";
import { PredictionService } from "@votiverse/prediction";
import type {
  CommitPredictionParams,
  RecordOutcomeParams,
  Prediction,
  PredictionEvaluation,
  TrackRecord,
} from "@votiverse/prediction";
import { PollingService } from "@votiverse/polling";
import type {
  CreatePollParams,
  SubmitResponseParams,
  Poll,
  PollResults,
  TrendData,
} from "@votiverse/polling";

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
  readonly topicIds: readonly TopicId[];
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
  private readonly pollingService: PollingService;

  /** In-memory state derived from events. */
  private readonly topics = new Map<TopicId, Topic>();
  private readonly topicAncestors = new Map<TopicId, TopicId[]>();
  private readonly votingEvents = new Map<VotingEventId, VotingEvent>();
  private readonly issues = new Map<IssueId, Issue>();

  constructor(options: EngineOptions) {
    this.governanceConfig = options.config;
    this.eventStore = options.eventStore ?? new InMemoryEventStore();

    this.identityProvider = options.identityProvider ?? new InvitationProvider(this.eventStore);

    this.delegationService = new DelegationService(this.eventStore, this.governanceConfig);
    this.votingService = new VotingService(this.eventStore, this.governanceConfig);
    this.predictionService = new PredictionService(this.eventStore, this.governanceConfig);
    this.pollingService = new PollingService(this.eventStore, this.governanceConfig);
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

        // Rebuild issues (we need to reconstruct from the event payload)
        // Issues aren't individually evented in Phase 1, they're part of VotingEventCreated
        // We need the issue details from the event, but the event only stores IDs
        // For rehydration, we reconstruct minimal issues
        for (const issueId of payload.issueIds) {
          if (!this.issues.has(issueId)) {
            this.issues.set(issueId, {
              id: issueId,
              title: "",
              description: "",
              topicIds: [],
              votingEventId: payload.votingEventId,
            });
          }
        }
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

      for (const issueParams of params.issues) {
        const issueId = generateIssueId();
        issueIds.push(issueId);
        const issue: Issue = {
          id: issueId,
          title: issueParams.title,
          description: issueParams.description,
          topicIds: issueParams.topicIds,
          votingEventId,
        };
        this.issues.set(issueId, issue);
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
        issue.topicIds,
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
        issue.topicIds,
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
        issue.topicIds,
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
    cast: (participantId: ParticipantId, issueId: IssueId, choice: VoteChoice): Promise<void> =>
      this.votingService.cast({ participantId, issueId, choice }),

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
        issue.topicIds,
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
  // Polling API
  // -----------------------------------------------------------------------

  /** Polling operations. */
  readonly polls = {
    create: (params: CreatePollParams): Promise<Poll> => this.pollingService.create(params),

    respond: (params: SubmitResponseParams) => this.pollingService.respond(params),

    results: (
      pollId: PollId,
      eligibleCount: number,
    ): Promise<PollResults> => this.pollingService.results(pollId, eligibleCount),

    trends: (topicId: TopicId, eligibleCount: number): Promise<TrendData> =>
      this.pollingService.trends(topicId, eligibleCount),

    get: (pollId: PollId) => this.pollingService.getPoll(pollId),

    list: () => this.pollingService.getAllPolls(),
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
