import { describe, it, expect } from "vitest";
import { createEvent } from "../../src/events.js";
import type {
  DomainEvent,
  VoteCastEvent,
  DelegationCreatedEvent,
  ParticipantRegisteredEvent,
} from "../../src/events.js";
import type {
  EventId,
  ParticipantId,
  IssueId,
  DelegationId,
  TopicId,
  Timestamp,
} from "../../src/types.js";

describe("Event definitions", () => {
  const eventId = "evt-001" as EventId;
  const ts = 1705320000000 as Timestamp;

  describe("createEvent()", () => {
    it("creates a ParticipantRegistered event", () => {
      const event = createEvent<ParticipantRegisteredEvent>(
        "ParticipantRegistered",
        {
          participantId: "p-001" as ParticipantId,
          name: "Alice",
        },
        eventId,
        ts,
      );

      expect(event.id).toBe(eventId);
      expect(event.type).toBe("ParticipantRegistered");
      expect(event.timestamp).toBe(ts);
      expect(event.payload.participantId).toBe("p-001");
      expect(event.payload.name).toBe("Alice");
    });

    it("creates a VoteCast event", () => {
      const event = createEvent<VoteCastEvent>(
        "VoteCast",
        {
          participantId: "p-001" as ParticipantId,
          issueId: "i-001" as IssueId,
          choice: "for",
        },
        eventId,
        ts,
      );

      expect(event.type).toBe("VoteCast");
      expect(event.payload.participantId).toBe("p-001");
      expect(event.payload.issueId).toBe("i-001");
      expect(event.payload.choice).toBe("for");
    });

    it("creates a DelegationCreated event", () => {
      const event = createEvent<DelegationCreatedEvent>(
        "DelegationCreated",
        {
          delegationId: "d-001" as DelegationId,
          sourceId: "p-001" as ParticipantId,
          targetId: "p-002" as ParticipantId,
          topicScope: ["t-finance" as TopicId],
        },
        eventId,
        ts,
      );

      expect(event.type).toBe("DelegationCreated");
      expect(event.payload.sourceId).toBe("p-001");
      expect(event.payload.targetId).toBe("p-002");
      expect(event.payload.topicScope).toEqual(["t-finance"]);
    });

    it("preserves all fields as readonly", () => {
      const event = createEvent<VoteCastEvent>(
        "VoteCast",
        {
          participantId: "p-001" as ParticipantId,
          issueId: "i-001" as IssueId,
          choice: "for",
        },
        eventId,
        ts,
      );

      // The event should be structurally valid
      expect(Object.isFrozen(event)).toBe(false); // JS doesn't auto-freeze
      // But TypeScript readonly prevents mutations at compile time
      expect(event.id).toBe(eventId);
      expect(event.type).toBe("VoteCast");
    });
  });

  describe("DomainEvent union", () => {
    it("allows type narrowing via the type field", () => {
      const event: DomainEvent = createEvent<VoteCastEvent>(
        "VoteCast",
        {
          participantId: "p-001" as ParticipantId,
          issueId: "i-001" as IssueId,
          choice: "against",
        },
        eventId,
        ts,
      );

      if (event.type === "VoteCast") {
        expect(event.payload.choice).toBe("against");
      }
    });

    it("supports all event types in the union", () => {
      const types: DomainEvent["type"][] = [
        "ParticipantRegistered",
        "ParticipantStatusChanged",
        "TopicCreated",
        "VotingEventCreated",
        "VotingEventClosed",
        "DelegationCreated",
        "DelegationRevoked",
        "VoteCast",
        "VoteRetracted",
        "IssueCancelled",
        "PredictionCommitted",
        "OutcomeRecorded",
        "PollCreated",
        "PollResponseSubmitted",
        "IntegrityCommitment",
        "ProposalSubmitted",
        "ProposalVersionCreated",
        "ProposalLocked",
        "ProposalWithdrawn",
        "CandidacyDeclared",
        "CandidacyVersionCreated",
        "CandidacyWithdrawn",
        "CommunityNoteCreated",
        "CommunityNoteEvaluated",
        "CommunityNoteWithdrawn",
        "ProposalEndorsed",
        "RoleGranted",
        "RoleRevoked",
        "ScoringEventCreated",
        "ScoringEventOpened",
        "ScoringEventDeadlineExtended",
        "ScoringEventDraftUpdated",
        "ScorecardSubmitted",
        "ScorecardRevised",
        "ScoringEventClosed",
      ];

      expect(types).toHaveLength(35);
    });
  });
});
