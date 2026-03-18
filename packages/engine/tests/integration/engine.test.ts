import { describe, it, expect, beforeEach } from "vitest";
import { VotiverseEngine, createEngine } from "../../src/engine.js";
import { InMemoryEventStore, timestamp, ValidationError, TestClock, GovernanceRuleViolation } from "@votiverse/core";
import type { ParticipantId, TopicId, Timestamp, ContentHash } from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import { InvitationProvider } from "@votiverse/identity";
import { isOk } from "@votiverse/core";

const DAY = 86_400_000;

/** Create a timeline where voting is currently active relative to the clock. */
function activeVotingTimeline(clock: TestClock) {
  const now = clock.now() as number;
  return {
    deliberationStart: timestamp(now - 7 * DAY) as Timestamp,
    votingStart: timestamp(now - 1 * DAY) as Timestamp,
    votingEnd: timestamp(now + 6 * DAY) as Timestamp,
  };
}

describe("VotiverseEngine — integration", () => {
  let engine: VotiverseEngine;
  let store: InMemoryEventStore;
  let provider: InvitationProvider;
  let clock: TestClock;

  beforeEach(() => {
    store = new InMemoryEventStore();
    provider = new InvitationProvider(store);
    clock = new TestClock();
    engine = createEngine({
      config: getPreset("LIQUID_STANDARD"),
      eventStore: store,
      identityProvider: provider,
      timeProvider: clock,
    });
  });

  async function inviteParticipants(...names: string[]): Promise<ParticipantId[]> {
    const ids: ParticipantId[] = [];
    for (const name of names) {
      const result = await provider.invite(name);
      if (isOk(result)) {
        ids.push(result.value.id);
      }
    }
    return ids;
  }

  describe("Full voting lifecycle", () => {
    it("creates a voting event, casts votes, and computes tally", async () => {
      const [alice, bob, carol] = await inviteParticipants("Alice", "Bob", "Carol");
      const financeTopic = await engine.topics_api.create("Finance");

      const votingEvent = await engine.events.create({
        title: "Q1 Budget Vote",
        description: "Vote on the Q1 budget allocation",
        issues: [
          {
            title: "Approve Q1 Budget",
            description: "Shall we approve the proposed Q1 budget?",
            topicIds: [financeTopic.id],
          },
        ],
        eligibleParticipantIds: [alice!, bob!, carol!],
        timeline: activeVotingTimeline(clock),
      });

      expect(votingEvent.issueIds).toHaveLength(1);
      const issueId = votingEvent.issueIds[0]!;

      await engine.voting.cast(alice!, issueId, "for");
      await engine.voting.cast(bob!, issueId, "for");
      await engine.voting.cast(carol!, issueId, "against");

      const tally = await engine.voting.tally(issueId);
      expect(tally.winner).toBe("for");
      expect(tally.counts.get("for")).toBe(2);
      expect(tally.counts.get("against")).toBe(1);
      expect(tally.totalVotes).toBe(3);
    });

    it("handles delegation with voting override", async () => {
      const [alice, bob, carol, dave] = await inviteParticipants("Alice", "Bob", "Carol", "Dave");
      const topic = await engine.topics_api.create("Policy");

      const votingEvent = await engine.events.create({
        title: "Policy Vote",
        description: "Vote on a policy change",
        issues: [{ title: "New Policy", description: "Adopt the new policy?", topicIds: [topic.id] }],
        eligibleParticipantIds: [alice!, bob!, carol!, dave!],
        timeline: activeVotingTimeline(clock),
      });

      const issueId = votingEvent.issueIds[0]!;

      await engine.delegation.create({ sourceId: alice!, targetId: carol!, topicScope: [topic.id] });
      await engine.delegation.create({ sourceId: bob!, targetId: carol!, topicScope: [topic.id] });

      await engine.voting.cast(carol!, issueId, "for");
      await engine.voting.cast(dave!, issueId, "against");

      const tally = await engine.voting.tally(issueId);
      expect(tally.winner).toBe("for");
      expect(tally.counts.get("for")).toBe(3);
      expect(tally.counts.get("against")).toBe(1);

      // Alice overrides by voting directly
      await engine.voting.cast(alice!, issueId, "against");
      const tally2 = await engine.voting.tally(issueId);
      expect(tally2.counts.get("for")).toBe(2);
      expect(tally2.counts.get("against")).toBe(2);
      expect(tally2.winner).toBeNull();
    });

    it("handles transitive delegation chains", async () => {
      const [a, b, c, d] = await inviteParticipants("A", "B", "C", "D");
      const topic = await engine.topics_api.create("General");

      const event = await engine.events.create({
        title: "Chain Vote",
        description: "Testing transitive chains",
        issues: [{ title: "Issue 1", description: "Test issue", topicIds: [topic.id] }],
        eligibleParticipantIds: [a!, b!, c!, d!],
        timeline: activeVotingTimeline(clock),
      });

      const issueId = event.issueIds[0]!;
      await engine.delegation.create({ sourceId: a!, targetId: b!, topicScope: [topic.id] });
      await engine.delegation.create({ sourceId: b!, targetId: c!, topicScope: [topic.id] });

      await engine.voting.cast(c!, issueId, "for");
      await engine.voting.cast(d!, issueId, "against");

      const tally = await engine.voting.tally(issueId);
      expect(tally.counts.get("for")).toBe(3);
      expect(tally.counts.get("against")).toBe(1);
      expect(tally.winner).toBe("for");
    });
  });

  describe("Timeline enforcement", () => {
    it("rejects votes before voting starts", async () => {
      const [alice] = await inviteParticipants("Alice");
      const now = clock.now() as number;

      const event = await engine.events.create({
        title: "Future Vote",
        description: "Not yet open",
        issues: [{ title: "Issue", description: "Test", topicIds: [] }],
        eligibleParticipantIds: [alice!],
        timeline: {
          deliberationStart: timestamp(now + 1 * DAY) as Timestamp,
          votingStart: timestamp(now + 7 * DAY) as Timestamp,
          votingEnd: timestamp(now + 14 * DAY) as Timestamp,
        },
      });

      const issueId = event.issueIds[0]!;
      await expect(engine.voting.cast(alice!, issueId, "for")).rejects.toThrow("Voting has not started");
    });

    it("rejects votes after voting closes", async () => {
      const [alice] = await inviteParticipants("Alice");
      const now = clock.now() as number;

      const event = await engine.events.create({
        title: "Past Vote",
        description: "Already closed",
        issues: [{ title: "Issue", description: "Test", topicIds: [] }],
        eligibleParticipantIds: [alice!],
        timeline: {
          deliberationStart: timestamp(now - 14 * DAY) as Timestamp,
          votingStart: timestamp(now - 7 * DAY) as Timestamp,
          votingEnd: timestamp(now - 1 * DAY) as Timestamp,
        },
      });

      const issueId = event.issueIds[0]!;
      await expect(engine.voting.cast(alice!, issueId, "for")).rejects.toThrow("Voting has closed");
    });

    it("accepts votes within the voting window", async () => {
      const [alice] = await inviteParticipants("Alice");

      const event = await engine.events.create({
        title: "Active Vote",
        description: "Currently open",
        issues: [{ title: "Issue", description: "Test", topicIds: [] }],
        eligibleParticipantIds: [alice!],
        timeline: activeVotingTimeline(clock),
      });

      const issueId = event.issueIds[0]!;
      // Should not throw
      await engine.voting.cast(alice!, issueId, "for");
      const votes = await engine.voting.getVotes(issueId);
      expect(votes).toHaveLength(1);
    });

    it("transitions through phases via TestClock.advance()", async () => {
      const [alice] = await inviteParticipants("Alice");
      const now = clock.now() as number;

      const event = await engine.events.create({
        title: "Phased Vote",
        description: "Testing phase transitions",
        issues: [{ title: "Issue", description: "Test", topicIds: [] }],
        eligibleParticipantIds: [alice!],
        timeline: {
          deliberationStart: timestamp(now + 1 * DAY) as Timestamp,
          votingStart: timestamp(now + 3 * DAY) as Timestamp,
          votingEnd: timestamp(now + 10 * DAY) as Timestamp,
        },
      });

      const issueId = event.issueIds[0]!;

      // Phase 1: before deliberation — vote rejected
      await expect(engine.voting.cast(alice!, issueId, "for")).rejects.toThrow("Voting has not started");

      // Advance to deliberation phase — still rejected (voting hasn't started)
      clock.advance(2 * DAY);
      await expect(engine.voting.cast(alice!, issueId, "for")).rejects.toThrow("Voting has not started");

      // Advance to voting phase — accepted
      clock.advance(2 * DAY);
      await engine.voting.cast(alice!, issueId, "for");

      // Advance past voting end — rejected
      clock.advance(8 * DAY);
      await expect(engine.voting.cast(alice!, issueId, "against")).rejects.toThrow("Voting has closed");
    });
  });

  describe("Weight distribution and chain resolution", () => {
    it("computes weight distribution", async () => {
      const [alice, bob, carol] = await inviteParticipants("Alice", "Bob", "Carol");
      const topic = await engine.topics_api.create("Test");

      const event = await engine.events.create({
        title: "Weight Test",
        description: "Test weights",
        issues: [{ title: "Issue", description: "Test", topicIds: [topic.id] }],
        eligibleParticipantIds: [alice!, bob!, carol!],
        timeline: activeVotingTimeline(clock),
      });

      const issueId = event.issueIds[0]!;
      await engine.delegation.create({ sourceId: alice!, targetId: bob!, topicScope: [topic.id] });
      await engine.voting.cast(bob!, issueId, "for");
      await engine.voting.cast(carol!, issueId, "against");

      const weights = await engine.delegation.weights(issueId);
      expect(weights.weights.get(bob!)).toBe(2);
      expect(weights.weights.get(carol!)).toBe(1);
    });

    it("resolves delegation chain", async () => {
      const [alice, bob] = await inviteParticipants("Alice", "Bob");
      const topic = await engine.topics_api.create("Test");

      const event = await engine.events.create({
        title: "Chain Test",
        description: "Test chain resolution",
        issues: [{ title: "Issue", description: "Test", topicIds: [topic.id] }],
        eligibleParticipantIds: [alice!, bob!],
        timeline: activeVotingTimeline(clock),
      });

      const issueId = event.issueIds[0]!;
      await engine.delegation.create({ sourceId: alice!, targetId: bob!, topicScope: [topic.id] });
      await engine.voting.cast(bob!, issueId, "for");

      const chain = await engine.delegation.resolve(alice!, issueId);
      expect(chain.terminalVoter).toBe(bob!);
      expect(chain.chain).toEqual([alice!, bob!]);
    });
  });

  describe("Config API", () => {
    it("validates the current configuration", () => {
      const result = engine.config.validate(engine.config.getCurrent());
      expect(result.valid).toBe(true);
    });

    it("returns available presets", () => {
      const names = engine.config.getPresetNames();
      expect(names).toHaveLength(7);
    });

    it("derives a new config from current", () => {
      const derived = engine.config.derive({ ballot: { quorum: 0.5 } });
      expect(derived.ballot.quorum).toBe(0.5);
    });
  });

  describe("Multi-option election workflow", () => {
    it("creates an election with named candidates and tallies correctly", async () => {
      const [alice, bob, carol, dave, eve] = await inviteParticipants("Alice", "Bob", "Carol", "Dave", "Eve");
      const candidates = ["Alice Johnson", "Bob Smith", "Carol Davis"];

      const votingEvent = await engine.events.create({
        title: "Board Officer Election",
        description: "Elect the next chairperson",
        issues: [{ title: "Elect Chairperson", description: "Choose the next chairperson", topicIds: [], choices: candidates }],
        eligibleParticipantIds: [alice!, bob!, carol!, dave!, eve!],
        timeline: activeVotingTimeline(clock),
      });

      const issueId = votingEvent.issueIds[0]!;
      const issue = engine.events.getIssue(issueId);
      expect(issue?.choices).toEqual(candidates);

      await engine.voting.cast(alice!, issueId, "Alice Johnson");
      await engine.voting.cast(bob!, issueId, "Bob Smith");
      await engine.voting.cast(carol!, issueId, "Alice Johnson");
      await engine.voting.cast(dave!, issueId, "Carol Davis");
      await engine.voting.cast(eve!, issueId, "Alice Johnson");

      const tally = await engine.voting.tally(issueId);
      expect(tally.winner).toBe("Alice Johnson");
      expect(tally.counts.get("Alice Johnson")).toBe(3);
      expect(tally.counts.get("Bob Smith")).toBe(1);
      expect(tally.counts.get("Carol Davis")).toBe(1);
    });

    it("rejects invalid choices through the engine API", async () => {
      const [alice] = await inviteParticipants("Alice");

      const votingEvent = await engine.events.create({
        title: "Election",
        description: "Test",
        issues: [{ title: "Pick One", description: "Choose a candidate", topicIds: [], choices: ["Option A", "Option B"] }],
        eligibleParticipantIds: [alice!],
        timeline: activeVotingTimeline(clock),
      });

      const issueId = votingEvent.issueIds[0]!;
      await expect(engine.voting.cast(alice!, issueId, "Option C")).rejects.toThrow(ValidationError);

      await engine.voting.cast(alice!, issueId, "abstain");
      const votes = await engine.voting.getVotes(issueId);
      expect(votes).toHaveLength(1);
      expect(votes[0]!.choice).toBe("abstain");
    });

    it("supports ranked-choice election through the engine", async () => {
      const rankedStore = new InMemoryEventStore();
      const rankedProvider = new InvitationProvider(rankedStore);
      const rankedClock = new TestClock();
      const rankedEngine = createEngine({
        config: deriveConfig(getPreset("LIQUID_STANDARD"), { ballot: { votingMethod: "ranked-choice" } }),
        eventStore: rankedStore,
        identityProvider: rankedProvider,
        timeProvider: rankedClock,
      });

      const ids: ParticipantId[] = [];
      for (const name of ["V1", "V2", "V3"]) {
        const result = await rankedProvider.invite(name);
        if (isOk(result)) ids.push(result.value.id);
      }
      const [v1, v2, v3] = ids;

      const candidates = ["Alpha", "Beta", "Gamma"];
      const event = await rankedEngine.events.create({
        title: "Ranked Election",
        description: "Test ranked choice",
        issues: [{ title: "Pick Winner", description: "Rank the candidates", topicIds: [], choices: candidates }],
        eligibleParticipantIds: [v1!, v2!, v3!],
        timeline: activeVotingTimeline(rankedClock),
      });

      const issueId = event.issueIds[0]!;
      await rankedEngine.voting.cast(v1!, issueId, ["Alpha", "Gamma"]);
      await rankedEngine.voting.cast(v2!, issueId, ["Alpha", "Beta"]);
      await rankedEngine.voting.cast(v3!, issueId, ["Gamma", "Beta"]);

      await expect(rankedEngine.voting.cast(v1!, issueId, ["Alpha", "InvalidCandidate"])).rejects.toThrow(ValidationError);

      const tally = await rankedEngine.voting.tally(issueId);
      expect(tally.winner).toBe("Alpha");
    });

    it("preserves choices through rehydration", async () => {
      const [alice] = await inviteParticipants("Alice");

      await engine.events.create({
        title: "Election",
        description: "Test rehydration",
        issues: [{ title: "Pick Candidate", description: "Choose one", topicIds: [], choices: ["Candidate A", "Candidate B"] }],
        eligibleParticipantIds: [alice!],
        timeline: activeVotingTimeline(clock),
      });

      const engine2 = createEngine({
        config: getPreset("LIQUID_STANDARD"),
        eventStore: store,
        identityProvider: provider,
        timeProvider: clock,
      });
      await engine2.rehydrate();

      const issues = engine2.events.listIssues();
      const electionIssue = issues.find(i => i.title === "Pick Candidate");
      expect(electionIssue?.choices).toEqual(["Candidate A", "Candidate B"]);
    });
  });

  describe("Poll time window enforcement", () => {
    it("rejects poll response before schedule", async () => {
      const [alice] = await inviteParticipants("Alice");
      const now = clock.now() as number;

      // Use a config with polls enabled
      const pollStore = new InMemoryEventStore();
      const pollProvider = new InvitationProvider(pollStore);
      const pollClock = new TestClock();
      const pollEngine = createEngine({
        config: getPreset("LIQUID_ACCOUNTABLE"),
        eventStore: pollStore,
        identityProvider: pollProvider,
        timeProvider: pollClock,
      });

      const pResult = await pollProvider.invite("Alice");
      const pid = isOk(pResult) ? pResult.value.id : ("" as ParticipantId);
      const pNow = pollClock.now() as number;

      const poll = await pollEngine.polls.create({
        title: "Future Poll",
        topicScope: [],
        questions: [
          { text: "Q?", questionType: { type: "yes-no" }, topicIds: [], tags: [] },
        ],
        schedule: timestamp(pNow + 2 * DAY) as Timestamp,
        closesAt: timestamp(pNow + 7 * DAY) as Timestamp,
        createdBy: pid,
      });
      expect(poll.status).toBe("scheduled");

      await expect(
        pollEngine.polls.respond({
          pollId: poll.id,
          participantId: pid,
          answers: [{ questionId: poll.questions[0]!.id, value: true }],
        }),
      ).rejects.toThrow("not yet open");
    });

    it("accepts poll response within window, rejects after close", async () => {
      const pollStore = new InMemoryEventStore();
      const pollProvider = new InvitationProvider(pollStore);
      const pollClock = new TestClock();
      const pollEngine = createEngine({
        config: getPreset("LIQUID_ACCOUNTABLE"),
        eventStore: pollStore,
        identityProvider: pollProvider,
        timeProvider: pollClock,
      });

      const aliceResult = await pollProvider.invite("Alice");
      const bobResult = await pollProvider.invite("Bob");
      const alicePid = isOk(aliceResult) ? aliceResult.value.id : ("" as ParticipantId);
      const bobPid = isOk(bobResult) ? bobResult.value.id : ("" as ParticipantId);
      const pNow = pollClock.now() as number;

      const poll = await pollEngine.polls.create({
        title: "Timed Poll",
        topicScope: [],
        questions: [
          { text: "Agree?", questionType: { type: "yes-no" }, topicIds: [], tags: [] },
        ],
        schedule: timestamp(pNow + 1 * DAY) as Timestamp,
        closesAt: timestamp(pNow + 5 * DAY) as Timestamp,
        createdBy: alicePid,
      });

      // Advance into open window
      pollClock.advance(2 * DAY);
      await pollEngine.polls.respond({
        pollId: poll.id,
        participantId: alicePid,
        answers: [{ questionId: poll.questions[0]!.id, value: true }],
      });

      // Advance past close
      pollClock.advance(5 * DAY);
      await expect(
        pollEngine.polls.respond({
          pollId: poll.id,
          participantId: bobPid,
          answers: [{ questionId: poll.questions[0]!.id, value: false }],
        }),
      ).rejects.toThrow("Poll has closed");

      // Only Alice's response should exist
      const responses = await pollEngine.polls.get(poll.id);
      expect(responses!.status).toBe("closed");
    });

    it("poll status transitions through clock advancement", async () => {
      const pollStore = new InMemoryEventStore();
      const pollProvider = new InvitationProvider(pollStore);
      const pollClock = new TestClock();
      const pollEngine = createEngine({
        config: getPreset("LIQUID_ACCOUNTABLE"),
        eventStore: pollStore,
        identityProvider: pollProvider,
        timeProvider: pollClock,
      });

      const pResult = await pollProvider.invite("Admin");
      const adminId = isOk(pResult) ? pResult.value.id : ("" as ParticipantId);
      const pNow = pollClock.now() as number;

      const poll = await pollEngine.polls.create({
        title: "Phase Poll",
        topicScope: [],
        questions: [
          { text: "Q?", questionType: { type: "yes-no" }, topicIds: [], tags: [] },
        ],
        schedule: timestamp(pNow + 2 * DAY) as Timestamp,
        closesAt: timestamp(pNow + 8 * DAY) as Timestamp,
        createdBy: adminId,
      });

      expect(poll.status).toBe("scheduled");

      pollClock.advance(3 * DAY);
      let fetched = await pollEngine.polls.get(poll.id);
      expect(fetched!.status).toBe("open");

      pollClock.advance(6 * DAY);
      fetched = await pollEngine.polls.get(poll.id);
      expect(fetched!.status).toBe("closed");
    });
  });

  describe("Content lifecycle — proposals, candidacies, notes", () => {
    function deliberationTimeline(clock: TestClock) {
      const now = clock.now() as number;
      return {
        deliberationStart: timestamp(now - 7 * DAY) as Timestamp,
        votingStart: timestamp(now + 3 * DAY) as Timestamp,
        votingEnd: timestamp(now + 10 * DAY) as Timestamp,
      };
    }

    it("submits a proposal during deliberation, locks it when voting starts", async () => {
      const [alice, bob] = await inviteParticipants("Alice", "Bob");
      const event = await engine.events.create({
        title: "Budget Vote",
        description: "Test",
        issues: [{ title: "Fund the park?", description: "Test", topicIds: [] }],
        eligibleParticipantIds: [alice!, bob!],
        timeline: deliberationTimeline(clock),
      });
      const issueId = event.issueIds[0]!;

      // Submit during deliberation
      const proposal = await engine.proposals.submit({
        issueId,
        choiceKey: "for",
        authorId: alice!,
        title: "Park Proposal",
        contentHash: "hash-v1" as ContentHash,
      });
      expect(proposal.status).toBe("submitted");

      // Create a version
      const v2 = await engine.proposals.createVersion({
        proposalId: proposal.id,
        contentHash: "hash-v2" as ContentHash,
      });
      expect(v2.currentVersion).toBe(2);

      // Advance to voting phase
      clock.advance(4 * DAY);

      // Submit rejected after voting starts
      await expect(
        engine.proposals.submit({
          issueId,
          authorId: bob!,
          title: "Counter",
          contentHash: "hash-c" as ContentHash,
        }),
      ).rejects.toThrow("DELIBERATION_CLOSED");

      // Version rejected after voting starts
      await expect(
        engine.proposals.createVersion({
          proposalId: proposal.id,
          contentHash: "hash-v3" as ContentHash,
        }),
      ).rejects.toThrow("DELIBERATION_CLOSED");

      // Casting a vote locks the proposal
      await engine.voting.cast(alice!, issueId, "for");

      const locked = await engine.proposals.get(proposal.id);
      expect(locked!.status).toBe("locked");
    });

    it("declares a candidacy, versions it, and withdraws", async () => {
      const [alice] = await inviteParticipants("Alice");
      const topic = await engine.topics_api.create("Budget");

      const candidacy = await engine.candidacies.declare({
        participantId: alice!,
        topicScope: [topic.id],
        voteTransparencyOptIn: true,
        contentHash: "profile-v1" as ContentHash,
      });
      expect(candidacy.status).toBe("active");

      // New version
      const v2 = await engine.candidacies.createVersion({
        candidacyId: candidacy.id,
        contentHash: "profile-v2" as ContentHash,
        topicScope: [topic.id],
      });
      expect(v2.currentVersion).toBe(2);

      // Withdraw
      await engine.candidacies.withdraw(candidacy.id, alice!);
      const withdrawn = await engine.candidacies.get(candidacy.id);
      expect(withdrawn!.status).toBe("withdrawn");
    });

    it("creates community notes with evaluations and computes visibility", async () => {
      // Use a config with community notes enabled
      const notesStore = new InMemoryEventStore();
      const notesProvider = new InvitationProvider(notesStore);
      const notesClock = new TestClock();
      const notesEngine = createEngine({
        config: getPreset("LIQUID_ACCOUNTABLE"),
        eventStore: notesStore,
        identityProvider: notesProvider,
        timeProvider: notesClock,
      });

      const ids: ParticipantId[] = [];
      for (const name of ["Author", "E1", "E2", "E3"]) {
        const result = await notesProvider.invite(name);
        if (isOk(result)) ids.push(result.value.id);
      }
      const [author, e1, e2, e3] = ids;

      const note = await notesEngine.notes.create({
        authorId: author!,
        contentHash: "note-hash" as ContentHash,
        targetType: "proposal",
        targetId: "prop-1",
        targetVersionNumber: 1,
      });

      // Evaluate
      await notesEngine.notes.evaluate(note.id, e1!, "endorse");
      await notesEngine.notes.evaluate(note.id, e2!, "endorse");
      await notesEngine.notes.evaluate(note.id, e3!, "dispute");

      const retrieved = await notesEngine.notes.get(note.id);
      expect(retrieved!.endorsementCount).toBe(2);
      expect(retrieved!.disputeCount).toBe(1);

      const vis = notesEngine.notes.computeVisibility(retrieved!);
      expect(vis.visible).toBe(true); // 2/3 ≈ 0.67 > 0.3 threshold, 3 >= 3 minEvals
      expect(vis.ratio).toBeCloseTo(0.667, 2);
    });
  });

  describe("Event store integration", () => {
    it("records all operations as events", async () => {
      const [alice, bob] = await inviteParticipants("Alice", "Bob");
      const topic = await engine.topics_api.create("Test");

      await engine.events.create({
        title: "Event",
        description: "Test",
        issues: [{ title: "Issue", description: "Test", topicIds: [topic.id] }],
        eligibleParticipantIds: [alice!, bob!],
        timeline: activeVotingTimeline(clock),
      });

      const events = await store.getAll();
      expect(events).toHaveLength(4);
      const types = events.map((e) => e.type);
      expect(types).toContain("ParticipantRegistered");
      expect(types).toContain("TopicCreated");
      expect(types).toContain("VotingEventCreated");
    });
  });
});
