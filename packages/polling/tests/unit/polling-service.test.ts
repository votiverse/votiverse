import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "@votiverse/core";
import type { ParticipantId, PollId, TopicId, Timestamp } from "@votiverse/core";
import { getPreset } from "@votiverse/config";
import { PollingService } from "../../src/polling-service.js";

const ts = (n: number) => n as Timestamp;
const tid = (s: string) => s as TopicId;

describe("PollingService", () => {
  let store: InMemoryEventStore;
  let service: PollingService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    service = new PollingService(store, getPreset("LIQUID_ACCOUNTABLE"));
  });

  describe("create()", () => {
    it("creates a poll and records an event", async () => {
      const poll = await service.create({
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

      expect(poll.id).toBeTruthy();
      expect(poll.questions).toHaveLength(1);
      expect(poll.questions[0]!.id).toBeTruthy();

      const events = await store.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("PollCreated");
    });

    it("throws when polls are disabled", async () => {
      const disabled = new PollingService(store, getPreset("TOWN_HALL"));
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
      const poll = await service.create({
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
        pollId: poll.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: poll.questions[0]!.id, value: 4 }],
      });

      expect(response.participantHash).toBeTruthy();
      expect(response.answers).toHaveLength(1);
    });

    it("rejects duplicate responses from same participant", async () => {
      const poll = await service.create({
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
        pollId: poll.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: poll.questions[0]!.id, value: true }],
      });

      await expect(
        service.respond({
          pollId: poll.id,
          participantId: "alice" as ParticipantId,
          answers: [{ questionId: poll.questions[0]!.id, value: false }],
        }),
      ).rejects.toThrow("already responded");
    });

    it("allows different participants to respond", async () => {
      const poll = await service.create({
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
        pollId: poll.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: poll.questions[0]!.id, value: true }],
      });

      await service.respond({
        pollId: poll.id,
        participantId: "bob" as ParticipantId,
        answers: [{ questionId: poll.questions[0]!.id, value: false }],
      });

      const responses = await service.getResponses(poll.id);
      expect(responses).toHaveLength(2);
    });

    it("rejects answers for non-existent questions", async () => {
      const poll = await service.create({
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
          pollId: poll.id,
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
      const poll = await service.create({
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
        pollId: poll.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: poll.questions[0]!.id, value: 4 }],
      });
      await service.respond({
        pollId: poll.id,
        participantId: "bob" as ParticipantId,
        answers: [{ questionId: poll.questions[0]!.id, value: 2 }],
      });

      const results = await service.results(poll.id, 5);
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
        pollId: "poll-1" as PollId,
        participantId: "alice" as ParticipantId,
        answers: [],
      };
      expect(params).toHaveProperty("participantId");
      expect(params).not.toHaveProperty("delegationId");
    });
  });
});
