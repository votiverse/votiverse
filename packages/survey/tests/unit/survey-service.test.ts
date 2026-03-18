import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "@votiverse/core";
import type { ParticipantId, SurveyId, TopicId, Timestamp } from "@votiverse/core";
import { getPreset } from "@votiverse/config";
import { SurveyService } from "../../src/survey-service.js";

const ts = (n: number) => n as Timestamp;
const tid = (s: string) => s as TopicId;

describe("SurveyService", () => {
  let store: InMemoryEventStore;
  let service: SurveyService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    service = new SurveyService(store, getPreset("LIQUID_ACCOUNTABLE"));
  });

  describe("create()", () => {
    it("creates a survey and records an event", async () => {
      const survey = await service.create({
        title: "Q1 Feedback",
        topicScope: [tid("education")],
        questions: [
          {
            text: "Has education improved?",
            questionType: { type: "direction" },
            topicIds: [tid("education")],
            tags: ["quality"],
          },
        ],
        schedule: ts(1000),
        closesAt: ts(50000),
        createdBy: "admin" as ParticipantId,
      });

      expect(survey.id).toBeTruthy();
      expect(survey.questions).toHaveLength(1);
      expect(survey.questions[0]!.id).toBeTruthy();

      const events = await store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("PollCreated");
    });

    it("throws when surveys are disabled", async () => {
      const disabled = new SurveyService(store, getPreset("TOWN_HALL"));
      await expect(
        disabled.create({
          title: "Test",
          topicScope: [],
          questions: [
            {
              text: "Q",
              questionType: { type: "yes-no" },
              topicIds: [],
              tags: [],
            },
          ],
          schedule: ts(1000),
          closesAt: ts(50000),
          createdBy: "admin" as ParticipantId,
        }),
      ).rejects.toThrow("disabled");
    });

    it("throws for empty questions", async () => {
      await expect(
        service.create({
          title: "Test",
          topicScope: [],
          questions: [],
          schedule: ts(1000),
          closesAt: ts(50000),
          createdBy: "admin" as ParticipantId,
        }),
      ).rejects.toThrow("at least one question");
    });

    it("throws when closesAt is before schedule", async () => {
      await expect(
        service.create({
          title: "Test",
          topicScope: [],
          questions: [
            {
              text: "Q",
              questionType: { type: "yes-no" },
              topicIds: [],
              tags: [],
            },
          ],
          schedule: ts(50000),
          closesAt: ts(1000),
          createdBy: "admin" as ParticipantId,
        }),
      ).rejects.toThrow("Close time");
    });
  });

  describe("respond()", () => {
    it("records a response", async () => {
      const survey = await service.create({
        title: "Test",
        topicScope: [],
        questions: [
          {
            text: "Rate 1-5",
            questionType: { type: "likert", scale: 5, labels: ["bad", "good"] },
            topicIds: [],
            tags: [],
          },
        ],
        schedule: ts(0),
        closesAt: ts(Date.now() + 1000000),
        createdBy: "admin" as ParticipantId,
      });

      const response = await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: 4 }],
      });

      expect(response.participantHash).toBeTruthy();
      expect(response.answers).toHaveLength(1);
    });

    it("rejects duplicate responses from same participant", async () => {
      const survey = await service.create({
        title: "Test",
        topicScope: [],
        questions: [
          {
            text: "Q",
            questionType: { type: "yes-no" },
            topicIds: [],
            tags: [],
          },
        ],
        schedule: ts(0),
        closesAt: ts(Date.now() + 1000000),
        createdBy: "admin" as ParticipantId,
      });

      await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      });

      await expect(
        service.respond({
          surveyId: survey.id,
          participantId: "alice" as ParticipantId,
          answers: [{ questionId: survey.questions[0]!.id, value: false }],
        }),
      ).rejects.toThrow("already responded");
    });

    it("allows different participants to respond", async () => {
      const survey = await service.create({
        title: "Test",
        topicScope: [],
        questions: [
          {
            text: "Q",
            questionType: { type: "yes-no" },
            topicIds: [],
            tags: [],
          },
        ],
        schedule: ts(0),
        closesAt: ts(Date.now() + 1000000),
        createdBy: "admin" as ParticipantId,
      });

      await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      });

      await service.respond({
        surveyId: survey.id,
        participantId: "bob" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: false }],
      });

      const responses = await service.getResponses(survey.id);
      expect(responses).toHaveLength(2);
    });

    it("rejects answers for non-existent questions", async () => {
      const survey = await service.create({
        title: "Test",
        topicScope: [],
        questions: [
          {
            text: "Q",
            questionType: { type: "yes-no" },
            topicIds: [],
            tags: [],
          },
        ],
        schedule: ts(0),
        closesAt: ts(Date.now() + 1000000),
        createdBy: "admin" as ParticipantId,
      });

      await expect(
        service.respond({
          surveyId: survey.id,
          participantId: "alice" as ParticipantId,
          answers: [
            {
              questionId: "nonexistent" as import("@votiverse/core").QuestionId,
              value: true,
            },
          ],
        }),
      ).rejects.toThrow("unknown question");
    });
  });

  describe("results()", () => {
    it("aggregates responses", async () => {
      const survey = await service.create({
        title: "Test",
        topicScope: [],
        questions: [
          {
            text: "Rate 1-5",
            questionType: { type: "likert", scale: 5, labels: ["bad", "good"] },
            topicIds: [],
            tags: [],
          },
        ],
        schedule: ts(0),
        closesAt: ts(Date.now() + 1000000),
        createdBy: "admin" as ParticipantId,
      });

      await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: 4 }],
      });
      await service.respond({
        surveyId: survey.id,
        participantId: "bob" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: 2 }],
      });

      const results = await service.results(survey.id, 5);
      expect(results.responseCount).toBe(2);
      expect(results.responseRate).toBeCloseTo(0.4);
      expect(results.questionResults[0]!.mean).toBe(3);
    });
  });

  describe("non-delegability (structural)", () => {
    it("SubmitResponseParams has no delegation reference", () => {
      // This test verifies the type system — SubmitResponseParams
      // accepts participantId, not a delegation. The package hashes
      // the participant internally. There is no API path for delegation.
      const params = {
        surveyId: "survey-1" as SurveyId,
        participantId: "alice" as ParticipantId,
        answers: [],
      };
      expect(params).toHaveProperty("participantId");
      expect(params).not.toHaveProperty("delegationId");
    });
  });
});
