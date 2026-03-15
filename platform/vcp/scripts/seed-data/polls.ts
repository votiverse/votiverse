/**
 * Poll definitions and responses.
 *
 * Only for assemblies with polls enabled:
 *   - Youth Advisory Panel (LIQUID_ACCOUNTABLE)
 *   - Municipal Budget Committee (CIVIC_PARTICIPATORY)
 */

export interface PollQuestionDef {
  text: string;
  questionType: Record<string, unknown>;
  topicIds: string[];
  tags: string[];
}

export interface PollDef {
  key: string;
  assemblyKey: string;
  title: string;
  topicScope: string[];
  questions: PollQuestionDef[];
  /** ms offset from now for schedule (open time) */
  scheduleOffset: number;
  /** ms offset from now for close time */
  closesAtOffset: number;
  createdByName: string;
}

export interface PollResponseDef {
  pollKey: string;
  assemblyKey: string;
  participantName: string;
  /** answers indexed by question index */
  answers: (number | string | boolean)[];
}

const DAY = 86_400_000;

export const POLLS: PollDef[] = [
  {
    key: "youth-satisfaction",
    assemblyKey: "youth",
    title: "Youth Program Satisfaction Survey",
    topicScope: [],
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
    key: "municipal-transit",
    assemblyKey: "municipal",
    title: "Transit Priority Sentiment",
    topicScope: [],
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
];

export const POLL_RESPONSES: PollResponseDef[] = [
  // ── Youth Program Satisfaction Survey (6 of 10 respond) ────────────
  { pollKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Sofia Reyes", answers: [4, true] },
  { pollKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Priya Sharma", answers: [3, true] },
  { pollKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Liam Torres", answers: [5, true] },
  { pollKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Aisha Moyo", answers: [4, false] },
  { pollKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Tariq Hassan", answers: [2, true] },
  { pollKey: "youth-satisfaction", assemblyKey: "youth", participantName: "Ravi Gupta", answers: [3, true] },

  // ── Transit Priority Sentiment (10 of 18 respond) ─────────────────
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Marcus Chen", answers: [true, 4] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Priya Sharma", answers: [true, 5] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "James Okafor", answers: [true, 3] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Carmen Delgado", answers: [false, 4] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Antoine Lefebvre", answers: [true, 5] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Nkechi Adeyemi", answers: [true, 4] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Mikhail Petrov", answers: [false, 2] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Isabel Cruz", answers: [true, 4] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Ayesha Khan", answers: [true, 3] },
  { pollKey: "municipal-transit", assemblyKey: "municipal", participantName: "Gabriela Santos", answers: [true, 5] },
];
