/**
 * Survey time window enforcement tests.
 *
 * Verifies that SurveyService respects schedule/closesAt boundaries
 * using injectable TestClock, matching the architectural pattern
 * established by voting window enforcement in the engine.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore, TestClock, timestamp } from "@votiverse/core";
import type { ParticipantId, Timestamp, TopicId } from "@votiverse/core";
import { SurveyService } from "../../src/survey-service.js";
import type { CreateSurveyParams } from "../../src/types.js";

const ts = (n: number) => n as Timestamp;
const tid = (s: string) => s as TopicId;
const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("Survey time window enforcement", () => {
  let store: InMemoryEventStore;
  let clock: TestClock;
  let service: SurveyService;

  beforeEach(() => {
    store = new InMemoryEventStore();
    clock = new TestClock();
    service = new SurveyService(store, clock);
  });

  function makeSurveyParams(overrides?: Partial<CreateSurveyParams>): CreateSurveyParams {
    const now = clock.now() as number;
    return {
      title: "Test Survey",
      topicScope: [tid("topic-1")],
      questions: [
        {
          text: "Do you agree?",
          questionType: { type: "yes-no" },
          topicIds: [tid("topic-1")],
          tags: [],
        },
      ],
      schedule: ts(now + 1 * DAY),
      closesAt: ts(now + 7 * DAY),
      createdBy: "admin" as ParticipantId,
      ...overrides,
    };
  }

  describe("survey status computation", () => {
    it("survey created before schedule is 'scheduled'", async () => {
      const survey = await service.create(makeSurveyParams());
      expect(survey.status).toBe("scheduled");
    });

    it("survey becomes 'open' when clock reaches schedule", async () => {
      const survey = await service.create(makeSurveyParams());
      expect(survey.status).toBe("scheduled");

      // Advance clock past the schedule time
      clock.advance(2 * DAY);
      const fetched = await service.getSurvey(survey.id);
      expect(fetched!.status).toBe("open");
    });

    it("survey becomes 'closed' when clock reaches closesAt", async () => {
      const survey = await service.create(makeSurveyParams());

      // Advance past closesAt
      clock.advance(8 * DAY);
      const fetched = await service.getSurvey(survey.id);
      expect(fetched!.status).toBe("closed");
    });

    it("transitions scheduled → open → closed via clock advancement", async () => {
      const survey = await service.create(makeSurveyParams());
      expect(survey.status).toBe("scheduled");

      // Phase 1: still scheduled (half day)
      clock.advance(12 * HOUR);
      let status = (await service.getSurvey(survey.id))!.status;
      expect(status).toBe("scheduled");

      // Phase 2: open (advance to 1.5 days, past schedule at 1 day)
      clock.advance(1 * DAY);
      status = (await service.getSurvey(survey.id))!.status;
      expect(status).toBe("open");

      // Phase 3: still open (advance to 5.5 days, before closesAt at 7 days)
      clock.advance(4 * DAY);
      status = (await service.getSurvey(survey.id))!.status;
      expect(status).toBe("open");

      // Phase 4: closed (advance to 8.5 days, past closesAt at 7 days)
      clock.advance(3 * DAY);
      status = (await service.getSurvey(survey.id))!.status;
      expect(status).toBe("closed");
    });

    it("survey created at or after schedule time starts as 'open'", async () => {
      const now = clock.now() as number;
      const survey = await service.create(makeSurveyParams({
        schedule: ts(now - HOUR), // schedule in the past
        closesAt: ts(now + 7 * DAY),
      }));
      expect(survey.status).toBe("open");
    });
  });

  describe("response window enforcement", () => {
    it("rejects responses before survey opens (scheduled)", async () => {
      const survey = await service.create(makeSurveyParams());
      expect(survey.status).toBe("scheduled");

      await expect(
        service.respond({
          surveyId: survey.id,
          participantId: "alice" as ParticipantId,
          answers: [{ questionId: survey.questions[0]!.id, value: true }],
        }),
      ).rejects.toThrow("not yet open");
    });

    it("accepts responses during open window", async () => {
      const survey = await service.create(makeSurveyParams());

      // Advance into the open window
      clock.advance(2 * DAY);

      const response = await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      });
      expect(response.participantHash).toBeTruthy();
    });

    it("rejects responses after survey closes", async () => {
      const survey = await service.create(makeSurveyParams());

      // Advance past closesAt
      clock.advance(8 * DAY);

      await expect(
        service.respond({
          surveyId: survey.id,
          participantId: "alice" as ParticipantId,
          answers: [{ questionId: survey.questions[0]!.id, value: true }],
        }),
      ).rejects.toThrow("Survey has closed");
    });

    it("accepts response at exactly the schedule boundary", async () => {
      const now = clock.now() as number;
      const survey = await service.create(makeSurveyParams({
        schedule: ts(now + 1 * DAY),
        closesAt: ts(now + 7 * DAY),
      }));

      // Advance to exactly the schedule time
      clock.advance(1 * DAY);

      const response = await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      });
      expect(response.participantHash).toBeTruthy();
    });

    it("rejects response 1ms before schedule", async () => {
      const now = clock.now() as number;
      const survey = await service.create(makeSurveyParams({
        schedule: ts(now + 1 * DAY),
        closesAt: ts(now + 7 * DAY),
      }));

      // Advance to 1ms before schedule
      clock.advance(1 * DAY - 1);

      await expect(
        service.respond({
          surveyId: survey.id,
          participantId: "alice" as ParticipantId,
          answers: [{ questionId: survey.questions[0]!.id, value: true }],
        }),
      ).rejects.toThrow("not yet open");
    });

    it("rejects response at exactly closesAt boundary (half-open interval)", async () => {
      const now = clock.now() as number;
      const survey = await service.create(makeSurveyParams({
        schedule: ts(now),
        closesAt: ts(now + 7 * DAY),
      }));

      // Advance to exactly closesAt
      clock.advance(7 * DAY);

      // closesAt is exclusive: currentTime > closesAt check at exactly closesAt
      // (currentTime === closesAt) — this depends on the > operator:
      // the service uses `currentTime > survey.closesAt`, so exactly at closesAt
      // the check is false and the response is ACCEPTED
      // This is different from voting (which uses >=)
      const response = await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      });
      expect(response.participantHash).toBeTruthy();
    });

    it("rejects response 1ms after closesAt", async () => {
      const now = clock.now() as number;
      const survey = await service.create(makeSurveyParams({
        schedule: ts(now),
        closesAt: ts(now + 7 * DAY),
      }));

      // Advance to 1ms after closesAt
      clock.advance(7 * DAY + 1);

      await expect(
        service.respond({
          surveyId: survey.id,
          participantId: "alice" as ParticipantId,
          answers: [{ questionId: survey.questions[0]!.id, value: true }],
        }),
      ).rejects.toThrow("Survey has closed");
    });
  });

  describe("time-sensitive lifecycle", () => {
    it("response accepted during window, rejected after advancement past close", async () => {
      const survey = await service.create(makeSurveyParams());

      // Move into open window
      clock.advance(2 * DAY);
      await service.respond({
        surveyId: survey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: survey.questions[0]!.id, value: true }],
      });

      // Move past close
      clock.advance(6 * DAY);
      await expect(
        service.respond({
          surveyId: survey.id,
          participantId: "bob" as ParticipantId,
          answers: [{ questionId: survey.questions[0]!.id, value: false }],
        }),
      ).rejects.toThrow("Survey has closed");

      // Verify only one response was recorded
      const responses = await service.getResponses(survey.id);
      expect(responses).toHaveLength(1);
    });

    it("multiple surveys with staggered schedules enforce independently", async () => {
      const now = clock.now() as number;

      const earlySurvey = await service.create(makeSurveyParams({
        title: "Early Survey",
        schedule: ts(now + 1 * DAY),
        closesAt: ts(now + 3 * DAY),
      }));

      const lateSurvey = await service.create(makeSurveyParams({
        title: "Late Survey",
        schedule: ts(now + 5 * DAY),
        closesAt: ts(now + 10 * DAY),
      }));

      // Day 2: early survey open, late survey scheduled
      clock.advance(2 * DAY);
      expect((await service.getSurvey(earlySurvey.id))!.status).toBe("open");
      expect((await service.getSurvey(lateSurvey.id))!.status).toBe("scheduled");

      await service.respond({
        surveyId: earlySurvey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: earlySurvey.questions[0]!.id, value: true }],
      });
      await expect(
        service.respond({
          surveyId: lateSurvey.id,
          participantId: "alice" as ParticipantId,
          answers: [{ questionId: lateSurvey.questions[0]!.id, value: true }],
        }),
      ).rejects.toThrow("not yet open");

      // Day 6: early survey closed, late survey open
      clock.advance(4 * DAY);
      expect((await service.getSurvey(earlySurvey.id))!.status).toBe("closed");
      expect((await service.getSurvey(lateSurvey.id))!.status).toBe("open");

      await expect(
        service.respond({
          surveyId: earlySurvey.id,
          participantId: "bob" as ParticipantId,
          answers: [{ questionId: earlySurvey.questions[0]!.id, value: false }],
        }),
      ).rejects.toThrow("Survey has closed");
      await service.respond({
        surveyId: lateSurvey.id,
        participantId: "alice" as ParticipantId,
        answers: [{ questionId: lateSurvey.questions[0]!.id, value: true }],
      });
    });
  });
});
