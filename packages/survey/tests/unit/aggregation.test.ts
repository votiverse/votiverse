import { describe, it, expect } from "vitest";
import { aggregateResults, computeTrend } from "../../src/aggregation.js";
import type { Survey, SurveyResponse, SurveyQuestion } from "../../src/types.js";
import type { SurveyId, QuestionId, TopicId, ParticipantId, Timestamp } from "@votiverse/core";

const sid = (s: string) => s as SurveyId;
const qid = (s: string) => s as QuestionId;
const tid = (s: string) => s as TopicId;
const ts = (n: number) => n as Timestamp;

function makeSurvey(questions: SurveyQuestion[], overrides?: Partial<Survey>): Survey {
  return {
    id: sid("survey-1"),
    title: "Test Survey",
    topicScope: [tid("education")],
    questions,
    schedule: ts(1000),
    closesAt: ts(50000),
    createdBy: "admin" as ParticipantId,
    status: "closed",
    ...overrides,
  };
}

function makeResponse(
  surveyId: string,
  answers: { questionId: string; value: number | string | boolean }[],
  participantHash: string = "hash",
  submittedAt: number = 2000,
): SurveyResponse {
  return {
    surveyId: sid(surveyId),
    participantHash,
    answers: answers.map((a) => ({
      questionId: qid(a.questionId),
      value: a.value,
    })),
    submittedAt: ts(submittedAt),
  };
}

describe("aggregateResults", () => {
  it("computes mean, median, and standard deviation for likert questions", () => {
    const q: SurveyQuestion = {
      id: qid("q1"),
      text: "Rate quality 1-5",
      questionType: { type: "likert", scale: 5, labels: ["poor", "excellent"] },
      topicIds: [tid("education")],
      tags: [],
    };
    const survey = makeSurvey([q]);
    const responses = [
      makeResponse("survey-1", [{ questionId: "q1", value: 4 }], "h1"),
      makeResponse("survey-1", [{ questionId: "q1", value: 5 }], "h2"),
      makeResponse("survey-1", [{ questionId: "q1", value: 3 }], "h3"),
      makeResponse("survey-1", [{ questionId: "q1", value: 4 }], "h4"),
    ];

    const results = aggregateResults(survey, responses, 10);
    expect(results.responseCount).toBe(4);
    expect(results.responseRate).toBeCloseTo(0.4);
    expect(results.questionResults).toHaveLength(1);

    const qr = results.questionResults[0]!;
    expect(qr.mean).toBe(4); // (4+5+3+4)/4
    expect(qr.median).toBe(4); // sorted [3,4,4,5], median = (4+4)/2
    expect(qr.standardDeviation).toBeDefined();
    expect(qr.responseCount).toBe(4);
  });

  it("computes distribution for direction questions", () => {
    const q: SurveyQuestion = {
      id: qid("q1"),
      text: "Has traffic changed?",
      questionType: { type: "direction" },
      topicIds: [tid("transport")],
      tags: [],
    };
    const survey = makeSurvey([q]);
    const responses = [
      makeResponse("survey-1", [{ questionId: "q1", value: "improved" }], "h1"),
      makeResponse("survey-1", [{ questionId: "q1", value: "same" }], "h2"),
      makeResponse("survey-1", [{ questionId: "q1", value: "worsened" }], "h3"),
      makeResponse("survey-1", [{ questionId: "q1", value: "improved" }], "h4"),
    ];

    const results = aggregateResults(survey, responses, 10);
    const qr = results.questionResults[0]!;
    // Direction: improved=1, same=0, worsened=-1
    // Values: 1, 0, -1, 1 → mean = 0.25
    expect(qr.mean).toBeCloseTo(0.25);
    expect(qr.distribution.get("improved")).toBe(2);
    expect(qr.distribution.get("same")).toBe(1);
    expect(qr.distribution.get("worsened")).toBe(1);
  });

  it("computes results for yes-no questions", () => {
    const q: SurveyQuestion = {
      id: qid("q1"),
      text: "Do you feel safe?",
      questionType: { type: "yes-no" },
      topicIds: [tid("safety")],
      tags: [],
    };
    const survey = makeSurvey([q]);
    const responses = [
      makeResponse("survey-1", [{ questionId: "q1", value: true }], "h1"),
      makeResponse("survey-1", [{ questionId: "q1", value: true }], "h2"),
      makeResponse("survey-1", [{ questionId: "q1", value: false }], "h3"),
    ];

    const results = aggregateResults(survey, responses, 5);
    const qr = results.questionResults[0]!;
    // yes=1, no=0 → mean = (1+1+0)/3 ≈ 0.667
    expect(qr.mean).toBeCloseTo(2 / 3);
  });

  it("handles empty responses", () => {
    const q: SurveyQuestion = {
      id: qid("q1"),
      text: "Rate 1-5",
      questionType: { type: "likert", scale: 5, labels: ["bad", "good"] },
      topicIds: [],
      tags: [],
    };
    const survey = makeSurvey([q]);
    const results = aggregateResults(survey, [], 10);
    expect(results.responseCount).toBe(0);
    expect(results.responseRate).toBe(0);
  });
});

describe("computeTrend", () => {
  it("computes an improving trend from direction questions", () => {
    const topicId = tid("education");

    // Create 4 surveys over time with improving sentiment
    const surveys: Survey[] = [
      makeSurvey(
        [
          {
            id: qid("q1"),
            text: "Has education improved?",
            questionType: { type: "direction" },
            topicIds: [topicId],
            tags: [],
          },
        ],
        { id: sid("s1"), closesAt: ts(10000), status: "closed" },
      ),
      makeSurvey(
        [
          {
            id: qid("q2"),
            text: "Has education improved?",
            questionType: { type: "direction" },
            topicIds: [topicId],
            tags: [],
          },
        ],
        { id: sid("s2"), closesAt: ts(20000), status: "closed" },
      ),
      makeSurvey(
        [
          {
            id: qid("q3"),
            text: "Has education improved?",
            questionType: { type: "direction" },
            topicIds: [topicId],
            tags: [],
          },
        ],
        { id: sid("s3"), closesAt: ts(30000), status: "closed" },
      ),
      makeSurvey(
        [
          {
            id: qid("q4"),
            text: "Has education improved?",
            questionType: { type: "direction" },
            topicIds: [topicId],
            tags: [],
          },
        ],
        { id: sid("s4"), closesAt: ts(40000), status: "closed" },
      ),
    ];

    // Responses get progressively more positive
    const responsesBySurvey = new Map<string, readonly SurveyResponse[]>([
      [
        "s1",
        [
          makeResponse("s1", [{ questionId: "q1", value: "worsened" }], "h1"),
          makeResponse("s1", [{ questionId: "q1", value: "worsened" }], "h2"),
          makeResponse("s1", [{ questionId: "q1", value: "same" }], "h3"),
        ],
      ],
      [
        "s2",
        [
          makeResponse("s2", [{ questionId: "q2", value: "worsened" }], "h1"),
          makeResponse("s2", [{ questionId: "q2", value: "same" }], "h2"),
          makeResponse("s2", [{ questionId: "q2", value: "same" }], "h3"),
        ],
      ],
      [
        "s3",
        [
          makeResponse("s3", [{ questionId: "q3", value: "same" }], "h1"),
          makeResponse("s3", [{ questionId: "q3", value: "improved" }], "h2"),
          makeResponse("s3", [{ questionId: "q3", value: "same" }], "h3"),
        ],
      ],
      [
        "s4",
        [
          makeResponse("s4", [{ questionId: "q4", value: "improved" }], "h1"),
          makeResponse("s4", [{ questionId: "q4", value: "improved" }], "h2"),
          makeResponse("s4", [{ questionId: "q4", value: "same" }], "h3"),
        ],
      ],
    ]);

    const trend = computeTrend(topicId, surveys, responsesBySurvey, 10);
    expect(trend.points).toHaveLength(4);
    expect(trend.direction).toBe("improving");
    expect(trend.slope).toBeGreaterThan(0);

    // Scores should increase: -0.67, -0.33, 0.33, 0.67
    expect(trend.points[0]!.score).toBeLessThan(trend.points[3]!.score);
  });

  it("returns insufficient for less than 2 data points", () => {
    const topicId = tid("education");
    const surveys: Survey[] = [
      makeSurvey(
        [
          {
            id: qid("q1"),
            text: "Rate education",
            questionType: { type: "direction" },
            topicIds: [topicId],
            tags: [],
          },
        ],
        { id: sid("s1"), closesAt: ts(10000), status: "closed" },
      ),
    ];

    const responsesBySurvey = new Map<string, readonly SurveyResponse[]>([
      ["s1", [makeResponse("s1", [{ questionId: "q1", value: "improved" }], "h1")]],
    ]);

    const trend = computeTrend(topicId, surveys, responsesBySurvey, 10);
    expect(trend.direction).toBe("insufficient");
  });

  it("ignores surveys without relevant topic questions", () => {
    const topicId = tid("education");
    const otherTopic = tid("finance");

    const surveys: Survey[] = [
      makeSurvey(
        [
          {
            id: qid("q1"),
            text: "Finance question",
            questionType: { type: "direction" },
            topicIds: [otherTopic],
            tags: [],
          },
        ],
        { id: sid("s1"), closesAt: ts(10000), status: "closed" },
      ),
    ];

    const responsesBySurvey = new Map<string, readonly SurveyResponse[]>([
      ["s1", [makeResponse("s1", [{ questionId: "q1", value: "improved" }], "h1")]],
    ]);

    const trend = computeTrend(topicId, surveys, responsesBySurvey, 10);
    expect(trend.points).toHaveLength(0);
    expect(trend.direction).toBe("insufficient");
  });
});
