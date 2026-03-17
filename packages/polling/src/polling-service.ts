/**
 * @votiverse/polling — PollingService
 *
 * High-level service for poll CRUD, response collection, aggregation,
 * and trend computation.
 */

import { createHash } from "node:crypto";
import type {
  EventStore,
  ParticipantId,
  PollId,
  Timestamp,
  TopicId,
  PollCreatedEvent,
  PollResponseSubmittedEvent,
} from "@votiverse/core";
import type { TimeProvider } from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  generatePollId,
  generateQuestionId,
  systemTime,
  NotFoundError,
  ValidationError,
  InvalidStateError,
} from "@votiverse/core";
import type { GovernanceConfig } from "@votiverse/config";
import type {
  Poll,
  PollQuestion,
  PollResponse,
  PollResults,
  TrendData,
  CreatePollParams,
  SubmitResponseParams,
  PollAnswer,
  PollStatus,
} from "./types.js";
import { aggregateResults, computeTrend } from "./aggregation.js";

/**
 * Service for managing participant polls.
 *
 * Poll responses are non-delegable — every participant responds for
 * themselves or not at all. The service enforces this by accepting
 * ParticipantIds (verified by the engine layer) and hashing them
 * internally for deduplication.
 */
export class PollingService {
  private readonly timeProvider: TimeProvider;

  constructor(
    private readonly eventStore: EventStore,
    private readonly config: GovernanceConfig,
    timeProvider?: TimeProvider,
  ) {
    this.timeProvider = timeProvider ?? systemTime;
  }

  /**
   * Create a new poll. Records a PollCreated event.
   */
  async create(params: CreatePollParams): Promise<Poll> {
    if (!this.config.features.polls) {
      throw new ValidationError("polls", "Polls are disabled in the current configuration");
    }

    if (params.questions.length === 0) {
      throw new ValidationError("questions", "Poll must have at least one question");
    }

    if (params.closesAt <= params.schedule) {
      throw new ValidationError("closesAt", "Close time must be after schedule time");
    }

    const pollId = generatePollId();
    const questions: PollQuestion[] = params.questions.map((q) => ({
      ...q,
      id: generateQuestionId(),
    }));

    const currentTime = this.timeProvider.now();
    const status: PollStatus = currentTime >= params.schedule ? "open" : "scheduled";

    // The core PollCreatedPayload.questions is string[]. We encode
    // poll metadata (closesAt, title, createdBy) as the first element
    // and question data as subsequent elements.
    const metadata = JSON.stringify({
      __meta: true,
      title: params.title,
      closesAt: params.closesAt,
      createdBy: params.createdBy,
    });

    const event = createEvent<PollCreatedEvent>(
      "PollCreated",
      {
        pollId,
        questions: [metadata, ...questions.map((q) => JSON.stringify(q))],
        schedule: params.schedule,
        topicScope: params.topicScope,
      },
      generateEventId(),
      currentTime,
    );

    await this.eventStore.append(event);

    return {
      id: pollId,
      title: params.title,
      topicScope: params.topicScope,
      questions,
      schedule: params.schedule,
      closesAt: params.closesAt,
      createdBy: params.createdBy,
      status,
    };
  }

  /**
   * Submit a response to a poll.
   *
   * Non-delegable: the participantId is hashed for deduplication.
   * Duplicate responses from the same participant are rejected.
   */
  async respond(params: SubmitResponseParams): Promise<PollResponse> {
    const poll = await this.getPoll(params.pollId);
    if (!poll) {
      throw new NotFoundError("Poll", params.pollId);
    }

    // Check that the poll is open
    const currentTime = this.timeProvider.now();
    if (currentTime < poll.schedule) {
      throw new InvalidStateError("Poll is not yet open for responses");
    }
    if (currentTime > poll.closesAt) {
      throw new InvalidStateError("Poll has closed");
    }

    // Hash participant ID for deduplication
    const participantHash = hashParticipant(params.participantId);

    // Check for duplicate responses
    const existingResponses = await this.getResponses(params.pollId);
    if (existingResponses.some((r) => r.participantHash === participantHash)) {
      throw new ValidationError(
        "participant",
        "This participant has already responded to this poll",
      );
    }

    // Validate answers match poll questions
    validateAnswers(params.answers, poll.questions);

    const event = createEvent<PollResponseSubmittedEvent>(
      "PollResponseSubmitted",
      {
        pollId: params.pollId,
        participantHash,
        responses: params.answers.map((a) => JSON.stringify(a)),
      },
      generateEventId(),
      currentTime,
    );

    await this.eventStore.append(event);

    return {
      pollId: params.pollId,
      participantHash,
      answers: params.answers,
      submittedAt: currentTime,
    };
  }

  /**
   * Get aggregated results for a poll.
   */
  async results(pollId: PollId, eligibleCount: number): Promise<PollResults> {
    const poll = await this.getPoll(pollId);
    if (!poll) {
      throw new NotFoundError("Poll", pollId);
    }
    const responses = await this.getResponses(pollId);
    return aggregateResults(poll, responses, eligibleCount);
  }

  /**
   * Compute trend data for a topic across all closed polls.
   */
  async trends(topicId: TopicId, eligibleCount: number): Promise<TrendData> {
    const polls = await this.getAllPolls();
    const responsesByPoll = new Map<string, readonly PollResponse[]>();
    for (const poll of polls) {
      const responses = await this.getResponses(poll.id);
      responsesByPoll.set(poll.id, responses);
    }
    return computeTrend(topicId, polls, responsesByPoll, eligibleCount);
  }

  /**
   * Get a poll by ID, reconstructed from events.
   */
  async getPoll(pollId: PollId): Promise<Poll | undefined> {
    const polls = await this.getAllPolls();
    return polls.find((p) => p.id === pollId);
  }

  /**
   * Get all polls.
   */
  async getAllPolls(): Promise<readonly Poll[]> {
    const events = await this.eventStore.query({
      types: ["PollCreated"],
    });

    return events.map((event) => {
      const e = event as PollCreatedEvent;

      // Parse metadata and questions. First element may be metadata.
      let title = "";
      let closesAt = (e.payload.schedule + 7 * 86400000) as Timestamp;
      let createdBy = "" as ParticipantId;
      const questions: PollQuestion[] = [];

      for (const raw of e.payload.questions) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed["__meta"] === true) {
          title = (parsed["title"] as string) ?? "";
          closesAt = ((parsed["closesAt"] as number) ??
            closesAt) as Timestamp;
          createdBy = ((parsed["createdBy"] as string) ?? "") as ParticipantId;
        } else {
          questions.push(parsed as unknown as PollQuestion);
        }
      }

      // Determine status from timestamps
      const currentTime = this.timeProvider.now();
      let status: PollStatus = "scheduled";
      if (currentTime >= e.payload.schedule) status = "open";
      if (currentTime >= closesAt) status = "closed";

      return {
        id: e.payload.pollId,
        title,
        topicScope: e.payload.topicScope,
        questions,
        schedule: e.payload.schedule,
        closesAt,
        createdBy,
        status,
      };
    });
  }

  /**
   * Check whether a participant has already responded to a poll.
   */
  async hasResponded(pollId: PollId, participantId: ParticipantId): Promise<boolean> {
    const hash = hashParticipant(participantId);
    const responses = await this.getResponses(pollId);
    return responses.some((r) => r.participantHash === hash);
  }

  /**
   * Get all responses for a poll.
   */
  async getResponses(pollId: PollId): Promise<readonly PollResponse[]> {
    const events = await this.eventStore.query({
      types: ["PollResponseSubmitted"],
    });

    const responses: PollResponse[] = [];
    for (const event of events) {
      const e = event as PollResponseSubmittedEvent;
      if (e.payload.pollId === pollId) {
        const answers: PollAnswer[] = e.payload.responses.map((r) => JSON.parse(r) as PollAnswer);
        responses.push({
          pollId,
          participantHash: e.payload.participantHash,
          answers,
          submittedAt: e.timestamp,
        });
      }
    }

    return responses;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashParticipant(participantId: ParticipantId): string {
  return createHash("sha256").update(participantId).digest("hex");
}

function validateAnswers(answers: readonly PollAnswer[], questions: readonly PollQuestion[]): void {
  const questionIds = new Set(questions.map((q) => q.id));
  for (const answer of answers) {
    if (!questionIds.has(answer.questionId)) {
      throw new ValidationError(
        "answers",
        `Answer references unknown question: ${answer.questionId}`,
      );
    }
  }
}
