/**
 * @votiverse/survey — SurveyService
 *
 * High-level service for survey CRUD, response collection, aggregation,
 * and trend computation.
 */

import { createHash } from "node:crypto";
import type {
  EventStore,
  ParticipantId,
  SurveyId,
  Timestamp,
  TopicId,
  SurveyCreatedEvent,
  SurveyResponseSubmittedEvent,
} from "@votiverse/core";
import type { TimeProvider } from "@votiverse/core";
import {
  createEvent,
  generateEventId,
  generateSurveyId,
  generateQuestionId,
  systemTime,
  NotFoundError,
  ValidationError,
  InvalidStateError,
} from "@votiverse/core";
import type {
  Survey,
  SurveyQuestion,
  SurveyResponse,
  SurveyResults,
  TrendData,
  CreateSurveyParams,
  SubmitResponseParams,
  SurveyAnswer,
  SurveyStatus,
} from "./types.js";
import { aggregateResults, computeTrend } from "./aggregation.js";

/**
 * Service for managing participant surveys.
 *
 * Survey responses are non-delegable — every participant responds for
 * themselves or not at all. The service enforces this by accepting
 * ParticipantIds (verified by the engine layer) and hashing them
 * internally for deduplication.
 */
export class SurveyService {
  private readonly timeProvider: TimeProvider;

  constructor(
    private readonly eventStore: EventStore,
    timeProvider?: TimeProvider,
  ) {
    this.timeProvider = timeProvider ?? systemTime;
  }

  /**
   * Create a new survey. Records a PollCreated event.
   */
  async create(params: CreateSurveyParams): Promise<Survey> {
    if (params.questions.length === 0) {
      throw new ValidationError("questions", "Survey must have at least one question");
    }

    if (params.closesAt <= params.schedule) {
      throw new ValidationError("closesAt", "Close time must be after schedule time");
    }

    const surveyId = generateSurveyId();
    const questions: SurveyQuestion[] = params.questions.map((q) => ({
      ...q,
      id: generateQuestionId(),
    }));

    const currentTime = this.timeProvider.now();
    const status: SurveyStatus = currentTime >= params.schedule ? "open" : "scheduled";

    // The core SurveyCreatedPayload.questions is string[]. We encode
    // survey metadata (closesAt, title, createdBy) as the first element
    // and question data as subsequent elements.
    const metadata = JSON.stringify({
      __meta: true,
      title: params.title,
      closesAt: params.closesAt,
      createdBy: params.createdBy,
    });

    const event = createEvent<SurveyCreatedEvent>(
      "PollCreated",
      {
        pollId: surveyId,
        questions: [metadata, ...questions.map((q) => JSON.stringify(q))],
        schedule: params.schedule,
        topicScope: params.topicScope,
      },
      generateEventId(),
      currentTime,
    );

    await this.eventStore.append(event);

    return {
      id: surveyId,
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
   * Submit a response to a survey.
   *
   * Non-delegable: the participantId is hashed for deduplication.
   * Duplicate responses from the same participant are rejected.
   */
  async respond(params: SubmitResponseParams): Promise<SurveyResponse> {
    const survey = await this.getSurvey(params.surveyId);
    if (!survey) {
      throw new NotFoundError("Survey", params.surveyId);
    }

    // Check that the survey is open
    const currentTime = this.timeProvider.now();
    if (currentTime < survey.schedule) {
      throw new InvalidStateError("Survey is not yet open for responses");
    }
    if (currentTime > survey.closesAt) {
      throw new InvalidStateError("Survey has closed");
    }

    // Hash participant ID for deduplication
    const participantHash = hashParticipant(params.participantId);

    // Check for duplicate responses
    const existingResponses = await this.getResponses(params.surveyId);
    if (existingResponses.some((r) => r.participantHash === participantHash)) {
      throw new ValidationError(
        "participant",
        "This participant has already responded to this survey",
      );
    }

    // Validate answers match survey questions
    validateAnswers(params.answers, survey.questions);

    const event = createEvent<SurveyResponseSubmittedEvent>(
      "PollResponseSubmitted",
      {
        pollId: params.surveyId,
        participantHash,
        responses: params.answers.map((a) => JSON.stringify(a)),
      },
      generateEventId(),
      currentTime,
    );

    await this.eventStore.append(event);

    return {
      surveyId: params.surveyId,
      participantHash,
      answers: params.answers,
      submittedAt: currentTime,
    };
  }

  /**
   * Get aggregated results for a survey.
   */
  async results(surveyId: SurveyId, eligibleCount: number): Promise<SurveyResults> {
    const survey = await this.getSurvey(surveyId);
    if (!survey) {
      throw new NotFoundError("Survey", surveyId);
    }
    const responses = await this.getResponses(surveyId);
    return aggregateResults(survey, responses, eligibleCount);
  }

  /**
   * Compute trend data for a topic across all closed surveys.
   */
  async trends(topicId: TopicId, eligibleCount: number): Promise<TrendData> {
    const surveys = await this.getAllSurveys();
    const responsesBySurvey = new Map<string, readonly SurveyResponse[]>();
    for (const survey of surveys) {
      const responses = await this.getResponses(survey.id);
      responsesBySurvey.set(survey.id, responses);
    }
    return computeTrend(topicId, surveys, responsesBySurvey, eligibleCount);
  }

  /**
   * Get a survey by ID, reconstructed from events.
   */
  async getSurvey(surveyId: SurveyId): Promise<Survey | undefined> {
    const surveys = await this.getAllSurveys();
    return surveys.find((s) => s.id === surveyId);
  }

  /**
   * Get all surveys.
   */
  async getAllSurveys(): Promise<readonly Survey[]> {
    const events = await this.eventStore.query({
      types: ["PollCreated"],
    });

    return events.map((event) => {
      const e = event as SurveyCreatedEvent;

      // Parse metadata and questions. First element may be metadata.
      let title = "";
      let closesAt = (e.payload.schedule + 7 * 86400000) as Timestamp;
      let createdBy = "" as ParticipantId;
      const questions: SurveyQuestion[] = [];

      for (const raw of e.payload.questions) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed["__meta"] === true) {
          title = (parsed["title"] as string) ?? "";
          closesAt = ((parsed["closesAt"] as number) ??
            closesAt) as Timestamp;
          createdBy = ((parsed["createdBy"] as string) ?? "") as ParticipantId;
        } else {
          questions.push(parsed as unknown as SurveyQuestion);
        }
      }

      // Determine status from timestamps
      const currentTime = this.timeProvider.now();
      let status: SurveyStatus = "scheduled";
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
   * Check whether a participant has already responded to a survey.
   */
  async hasResponded(surveyId: SurveyId, participantId: ParticipantId): Promise<boolean> {
    const hash = hashParticipant(participantId);
    const responses = await this.getResponses(surveyId);
    return responses.some((r) => r.participantHash === hash);
  }

  /**
   * Get all responses for a survey.
   */
  async getResponses(surveyId: SurveyId): Promise<readonly SurveyResponse[]> {
    const events = await this.eventStore.query({
      types: ["PollResponseSubmitted"],
    });

    const responses: SurveyResponse[] = [];
    for (const event of events) {
      const e = event as SurveyResponseSubmittedEvent;
      if (e.payload.pollId === surveyId) {
        const answers: SurveyAnswer[] = e.payload.responses.map((r) => JSON.parse(r) as SurveyAnswer);
        responses.push({
          surveyId,
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

function validateAnswers(answers: readonly SurveyAnswer[], questions: readonly SurveyQuestion[]): void {
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
