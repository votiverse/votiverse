/**
 * Survey definitions and responses.
 *
 * Only for assemblies with surveys enabled:
 *   - Youth Advisory Panel (LIQUID_DELEGATION)
 *   - Municipal Budget Committee (CIVIC)
 */

export interface SurveyQuestionDef {
  text: string;
  questionType: Record<string, unknown>;
  topicIds: string[];
  tags: string[];
}

export interface SurveyDef {
  key: string;
  assemblyKey: string;
  title: string;
  topicScope: string[];
  /** Topic keys to resolve to IDs at seed time. Overrides topicScope when present. */
  topicKeys?: string[];
  questions: SurveyQuestionDef[];
  /** ms offset from now for schedule (open time) */
  scheduleOffset: number;
  /** ms offset from now for close time */
  closesAtOffset: number;
  createdByName: string;
}

export interface SurveyResponseDef {
  surveyKey: string;
  assemblyKey: string;
  participantName: string;
  /** answers indexed by question index */
  answers: (number | string | boolean)[];
}

const DAY = 86_400_000;

export const SURVEYS: SurveyDef[] = [
  // ── Youth Advisory Panel ────────────────────────────────────────────

  {
    key: "youth-satisfaction",
    assemblyKey: "youth",
    title: "Youth Program Satisfaction Survey",
    topicScope: [],
    topicKeys: ["education"],
    questions: [
      {
        text: "How satisfied are you with current after-school programs?",
        questionType: { type: "likert", scale: 5, labels: ["Very dissatisfied", "Very satisfied"] },
        topicIds: [],
        tags: ["satisfaction", "after-school"],
      },
      {
        text: "Should the council prioritize mental health resources?",
        questionType: { type: "yes-no" },
        topicIds: [],
        tags: ["mental-health", "priorities"],
      },
    ],
    scheduleOffset: -10 * DAY,
    closesAtOffset: 4 * DAY,
    createdByName: "Sofia Reyes",
  },

  {
    key: "youth-events",
    assemblyKey: "youth",
    title: "Preferred Community Event Type",
    topicScope: [],
    topicKeys: ["events"],
    questions: [
      {
        text: "What type of community event would you most like to see this summer?",
        questionType: {
          type: "multiple-choice",
          options: ["Sports Tournament", "Art Workshop", "Hackathon", "Community Garden Day", "Movie Night"],
        },
        topicIds: [],
        tags: ["events", "community"],
      },
    ],
    scheduleOffset: -5 * DAY,
    closesAtOffset: 5 * DAY,
    createdByName: "Jin Park",
  },

  {
    key: "youth-study",
    assemblyKey: "youth",
    title: "Study Space Survey",
    topicScope: [],
    topicKeys: ["education"],
    questions: [
      {
        text: "How would you rate the quality of available study spaces?",
        questionType: { type: "likert", scale: 5, labels: ["Very poor", "Excellent"] },
        topicIds: [],
        tags: ["facilities", "study"],
      },
      {
        text: "Has access to quiet study areas changed since the library renovation?",
        questionType: { type: "direction" },
        topicIds: [],
        tags: ["facilities", "library"],
      },
    ],
    scheduleOffset: -20 * DAY,
    closesAtOffset: 60_000, // closes 1 min after seeding → "closed" by the time user opens browser
    createdByName: "Chloe Beaumont",
  },

  // ── Municipal Budget Committee ──────────────────────────────────────

  {
    key: "municipal-transit",
    assemblyKey: "municipal",
    title: "Transit Priority Sentiment",
    topicScope: [],
    topicKeys: ["transit"],
    questions: [
      {
        text: "Do you support expanding public transit routes?",
        questionType: { type: "yes-no" },
        topicIds: [],
        tags: ["transit", "expansion"],
      },
      {
        text: "Rate the urgency of infrastructure repairs",
        questionType: { type: "likert", scale: 5, labels: ["Not urgent", "Extremely urgent"] },
        topicIds: [],
        tags: ["infrastructure", "urgency"],
      },
    ],
    scheduleOffset: -7 * DAY,
    closesAtOffset: 7 * DAY,
    createdByName: "Marcus Chen",
  },

  {
    key: "municipal-transit-priority",
    assemblyKey: "municipal",
    title: "Transit Improvement Priority",
    topicScope: [],
    topicKeys: ["transit"],
    questions: [
      {
        text: "Which transit improvement should receive the highest priority?",
        questionType: {
          type: "multiple-choice",
          options: ["More frequent buses", "New subway line", "Better bike lanes", "Pedestrian zones", "Park-and-ride facilities"],
        },
        topicIds: [],
        tags: ["transit", "priorities"],
      },
    ],
    scheduleOffset: -3 * DAY,
    closesAtOffset: 10 * DAY,
    createdByName: "Carmen Delgado",
  },

  {
    key: "municipal-neighborhood",
    assemblyKey: "municipal",
    title: "Neighborhood Priorities",
    topicScope: [],
    topicKeys: ["infrastructure"],
    questions: [
      {
        text: "Should the city invest more in neighborhood parks and green spaces?",
        questionType: { type: "yes-no" },
        topicIds: [],
        tags: ["parks", "investment"],
      },
      {
        text: "How would you rate the safety of walking and cycling in your neighborhood?",
        questionType: { type: "likert", scale: 5, labels: ["Very unsafe", "Very safe"] },
        topicIds: [],
        tags: ["safety", "mobility"],
      },
      {
        text: "What is the most important neighborhood issue to address next?",
        questionType: {
          type: "multiple-choice",
          options: ["Street lighting", "Sidewalk repairs", "Noise pollution", "Traffic calming"],
        },
        topicIds: [],
        tags: ["neighborhood", "priorities"],
      },
    ],
    scheduleOffset: -4 * DAY,
    closesAtOffset: 8 * DAY,
    createdByName: "Fiona MacLeod",
  },
];

export const SURVEY_RESPONSES: SurveyResponseDef[] = [
  // ── Youth Program Satisfaction Survey (6 of 10 respond) ────────────
  { surveyKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Sofia Reyes", answers: [4, true] },
  { surveyKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Priya Sharma", answers: [3, true] },
  { surveyKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Liam Torres", answers: [5, true] },
  { surveyKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Aisha Moyo", answers: [4, false] },
  { surveyKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Tariq Hassan", answers: [2, true] },
  { surveyKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Ravi Gupta", answers: [3, true] },

  // ── Preferred Community Event Type (5 of 10 respond) ───────────────
  { surveyKey: "youth-events", assemblyKey: "youth", participantName: "Jin Park", answers: ["Hackathon"] },
  { surveyKey: "youth-events", assemblyKey: "youth", participantName: "Liam Torres", answers: ["Sports Tournament"] },
  { surveyKey: "youth-events", assemblyKey: "youth", participantName: "Chloe Beaumont", answers: ["Art Workshop"] },
  { surveyKey: "youth-events", assemblyKey: "youth", participantName: "Emilia Strand", answers: ["Hackathon"] },
  { surveyKey: "youth-events", assemblyKey: "youth", participantName: "Ravi Gupta", answers: ["Movie Night"] },

  // ── Study Space Survey (7 of 10 — CLOSED) ─────────────────────────
  { surveyKey: "youth-study", assemblyKey: "youth", participantName: "Sofia Reyes", answers: [4, "improved"] },
  { surveyKey: "youth-study", assemblyKey: "youth", participantName: "Priya Sharma", answers: [3, "improved"] },
  { surveyKey: "youth-study", assemblyKey: "youth", participantName: "Liam Torres", answers: [4, "same"] },
  { surveyKey: "youth-study", assemblyKey: "youth", participantName: "Jin Park", answers: [5, "improved"] },
  { surveyKey: "youth-study", assemblyKey: "youth", participantName: "Aisha Moyo", answers: [3, "same"] },
  { surveyKey: "youth-study", assemblyKey: "youth", participantName: "Nina Kowalski", answers: [2, "worsened"] },
  { surveyKey: "youth-study", assemblyKey: "youth", participantName: "Tariq Hassan", answers: [3, "improved"] },

  // ── Transit Priority Sentiment (10 of 18 respond) ─────────────────
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Marcus Chen", answers: [true, 4] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Priya Sharma", answers: [true, 5] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "James Okafor", answers: [true, 3] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Carmen Delgado", answers: [false, 4] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Antoine Lefebvre", answers: [true, 5] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Nkechi Adeyemi", answers: [true, 4] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Mikhail Petrov", answers: [false, 2] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Isabel Cruz", answers: [true, 4] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Ayesha Khan", answers: [true, 3] },
  { surveyKey: "municipal-transit", assemblyKey: "municipal", participantName: "Gabriela Santos", answers: [true, 5] },

  // ── Transit Improvement Priority (8 of 18 respond) ────────────────
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Marcus Chen", answers: ["More frequent buses"] },
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Priya Sharma", answers: ["Better bike lanes"] },
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Carmen Delgado", answers: ["More frequent buses"] },
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Antoine Lefebvre", answers: ["New subway line"] },
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Sunita Rao", answers: ["Better bike lanes"] },
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Omar Hadid", answers: ["Pedestrian zones"] },
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Fiona MacLeod", answers: ["More frequent buses"] },
  { surveyKey: "municipal-transit-priority", assemblyKey: "municipal", participantName: "Gabriela Santos", answers: ["Park-and-ride facilities"] },

  // ── Neighborhood Priorities (6 of 18 respond) ─────────────────────
  { surveyKey: "municipal-neighborhood", assemblyKey: "municipal", participantName: "James Okafor", answers: [true, 3, "Street lighting"] },
  { surveyKey: "municipal-neighborhood", assemblyKey: "municipal", participantName: "Nkechi Adeyemi", answers: [true, 4, "Sidewalk repairs"] },
  { surveyKey: "municipal-neighborhood", assemblyKey: "municipal", participantName: "Hana Yokota", answers: [true, 2, "Traffic calming"] },
  { surveyKey: "municipal-neighborhood", assemblyKey: "municipal", participantName: "Diego Morales", answers: [false, 3, "Noise pollution"] },
  { surveyKey: "municipal-neighborhood", assemblyKey: "municipal", participantName: "Lars Johansson", answers: [true, 4, "Street lighting"] },
  { surveyKey: "municipal-neighborhood", assemblyKey: "municipal", participantName: "Kwame Mensah", answers: [true, 5, "Sidewalk repairs"] },
];
