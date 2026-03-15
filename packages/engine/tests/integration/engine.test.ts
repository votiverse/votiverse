import { describe, it, expect, beforeEach } from "vitest";
import { VotiverseEngine, createEngine } from "../../src/engine.js";
import { InMemoryEventStore, timestamp, ValidationError } from "@votiverse/core";
import type { ParticipantId, TopicId, Timestamp } from "@votiverse/core";
import { getPreset, deriveConfig } from "@votiverse/config";
import { InvitationProvider } from "@votiverse/identity";
import { isOk } from "@votiverse/core";

describe("VotiverseEngine — integration", () => {
  let engine: VotiverseEngine;
  let store: InMemoryEventStore;
  let provider: InvitationProvider;

  beforeEach(() => {
    store = new InMemoryEventStore();
    provider = new InvitationProvider(store);
    engine = createEngine({
      config: getPreset("LIQUID_STANDARD"),
      eventStore: store,
      identityProvider: provider,
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
      // 1. Register participants
      const [alice, bob, carol] = await inviteParticipants("Alice", "Bob", "Carol");

      // 2. Create a topic
      const financeTopic = await engine.topics_api.create("Finance");

      // 3. Create a voting event
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
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      expect(votingEvent.issueIds).toHaveLength(1);
      const issueId = votingEvent.issueIds[0]!;

      // 4. Cast votes
      await engine.voting.cast(alice!, issueId, "for");
      await engine.voting.cast(bob!, issueId, "for");
      await engine.voting.cast(carol!, issueId, "against");

      // 5. Compute tally
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
        issues: [
          {
            title: "New Policy",
            description: "Adopt the new policy?",
            topicIds: [topic.id],
          },
        ],
        eligibleParticipantIds: [alice!, bob!, carol!, dave!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const issueId = votingEvent.issueIds[0]!;

      // Alice and Bob delegate to Carol
      await engine.delegation.create({
        sourceId: alice!,
        targetId: carol!,
        topicScope: [topic.id],
      });
      await engine.delegation.create({
        sourceId: bob!,
        targetId: carol!,
        topicScope: [topic.id],
      });

      // Carol votes "for" (carries weight 3: herself + Alice + Bob)
      await engine.voting.cast(carol!, issueId, "for");
      // Dave votes "against" (weight 1)
      await engine.voting.cast(dave!, issueId, "against");

      const tally = await engine.voting.tally(issueId);
      expect(tally.winner).toBe("for");
      expect(tally.counts.get("for")).toBe(3);
      expect(tally.counts.get("against")).toBe(1);
      expect(tally.totalVotes).toBe(4);

      // Now Alice overrides by voting directly
      await engine.voting.cast(alice!, issueId, "against");

      const tally2 = await engine.voting.tally(issueId);
      // Carol now has weight 2 (herself + Bob), Alice has weight 1
      expect(tally2.counts.get("for")).toBe(2);
      expect(tally2.counts.get("against")).toBe(2); // Alice (1) + Dave (1)
      expect(tally2.winner).toBeNull(); // tie
    });

    it("handles transitive delegation chains", async () => {
      const [a, b, c, d] = await inviteParticipants("A", "B", "C", "D");

      const topic = await engine.topics_api.create("General");
      const event = await engine.events.create({
        title: "Chain Vote",
        description: "Testing transitive chains",
        issues: [
          {
            title: "Issue 1",
            description: "Test issue",
            topicIds: [topic.id],
          },
        ],
        eligibleParticipantIds: [a!, b!, c!, d!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const issueId = event.issueIds[0]!;

      // A → B → C (transitive chain)
      await engine.delegation.create({
        sourceId: a!,
        targetId: b!,
        topicScope: [topic.id],
      });
      await engine.delegation.create({
        sourceId: b!,
        targetId: c!,
        topicScope: [topic.id],
      });

      // C votes, D votes
      await engine.voting.cast(c!, issueId, "for");
      await engine.voting.cast(d!, issueId, "against");

      const tally = await engine.voting.tally(issueId);
      // C carries weight 3 (A+B+C), D has weight 1
      expect(tally.counts.get("for")).toBe(3);
      expect(tally.counts.get("against")).toBe(1);
      expect(tally.winner).toBe("for");
    });
  });

  describe("Weight distribution and chain resolution", () => {
    it("computes weight distribution", async () => {
      const [alice, bob, carol] = await inviteParticipants("Alice", "Bob", "Carol");

      const topic = await engine.topics_api.create("Test");
      const event = await engine.events.create({
        title: "Weight Test",
        description: "Test weights",
        issues: [
          {
            title: "Issue",
            description: "Test",
            topicIds: [topic.id],
          },
        ],
        eligibleParticipantIds: [alice!, bob!, carol!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const issueId = event.issueIds[0]!;

      await engine.delegation.create({
        sourceId: alice!,
        targetId: bob!,
        topicScope: [topic.id],
      });
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
        issues: [
          {
            title: "Issue",
            description: "Test",
            topicIds: [topic.id],
          },
        ],
        eligibleParticipantIds: [alice!, bob!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const issueId = event.issueIds[0]!;

      await engine.delegation.create({
        sourceId: alice!,
        targetId: bob!,
        topicScope: [topic.id],
      });
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
      expect(names).toHaveLength(6);
    });

    it("derives a new config from current", () => {
      const derived = engine.config.derive({
        ballot: { quorum: 0.5 },
      });
      expect(derived.ballot.quorum).toBe(0.5);
    });
  });

  describe("Multi-option election workflow", () => {
    it("creates an election with named candidates and tallies correctly", async () => {
      const [alice, bob, carol, dave, eve] = await inviteParticipants(
        "Alice", "Bob", "Carol", "Dave", "Eve",
      );

      const candidates = ["Alice Johnson", "Bob Smith", "Carol Davis"];

      const votingEvent = await engine.events.create({
        title: "Board Officer Election",
        description: "Elect the next chairperson",
        issues: [
          {
            title: "Elect Chairperson",
            description: "Choose the next chairperson",
            topicIds: [],
            choices: candidates,
          },
        ],
        eligibleParticipantIds: [alice!, bob!, carol!, dave!, eve!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const issueId = votingEvent.issueIds[0]!;

      // Verify issue has choices
      const issue = engine.events.getIssue(issueId);
      expect(issue?.choices).toEqual(candidates);

      // Cast valid votes
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
        issues: [
          {
            title: "Pick One",
            description: "Choose a candidate",
            topicIds: [],
            choices: ["Option A", "Option B"],
          },
        ],
        eligibleParticipantIds: [alice!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const issueId = votingEvent.issueIds[0]!;

      // Invalid choice should throw
      await expect(
        engine.voting.cast(alice!, issueId, "Option C"),
      ).rejects.toThrow(ValidationError);

      // Abstain should always work
      await engine.voting.cast(alice!, issueId, "abstain");
      const votes = await engine.voting.getVotes(issueId);
      expect(votes).toHaveLength(1);
      expect(votes[0]!.choice).toBe("abstain");
    });

    it("supports ranked-choice election through the engine", async () => {
      const rankedStore = new InMemoryEventStore();
      const rankedProvider = new InvitationProvider(rankedStore);
      const rankedEngine = createEngine({
        config: deriveConfig(getPreset("LIQUID_STANDARD"), {
          ballot: { votingMethod: "ranked-choice" },
        }),
        eventStore: rankedStore,
        identityProvider: rankedProvider,
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
        issues: [{
          title: "Pick Winner",
          description: "Rank the candidates",
          topicIds: [],
          choices: candidates,
        }],
        eligibleParticipantIds: [v1!, v2!, v3!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const issueId = event.issueIds[0]!;

      // V1 ranks: Alpha > Gamma
      await rankedEngine.voting.cast(v1!, issueId, ["Alpha", "Gamma"]);
      // V2 ranks: Alpha > Beta
      await rankedEngine.voting.cast(v2!, issueId, ["Alpha", "Beta"]);
      // V3 ranks: Gamma > Beta (Gamma has fewer first-choice votes)
      await rankedEngine.voting.cast(v3!, issueId, ["Gamma", "Beta"]);

      // Invalid ranked choice should throw
      await expect(
        rankedEngine.voting.cast(v1!, issueId, ["Alpha", "InvalidCandidate"]),
      ).rejects.toThrow(ValidationError);

      const tally = await rankedEngine.voting.tally(issueId);
      // Round 1: Alpha=2, Gamma=1, Beta=0. Alpha has 2 > 1.5 majority → Alpha wins.
      expect(tally.winner).toBe("Alpha");
    });

    it("preserves choices through rehydration", async () => {
      const [alice] = await inviteParticipants("Alice");

      await engine.events.create({
        title: "Election",
        description: "Test rehydration",
        issues: [{
          title: "Pick Candidate",
          description: "Choose one",
          topicIds: [],
          choices: ["Candidate A", "Candidate B"],
        }],
        eligibleParticipantIds: [alice!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      // Create a new engine from the same store and rehydrate
      const engine2 = createEngine({
        config: getPreset("LIQUID_STANDARD"),
        eventStore: store,
        identityProvider: provider,
      });
      await engine2.rehydrate();

      const issues = engine2.events.listIssues();
      const electionIssue = issues.find(i => i.title === "Pick Candidate");
      expect(electionIssue?.choices).toEqual(["Candidate A", "Candidate B"]);
    });
  });

  describe("Event store integration", () => {
    it("records all operations as events", async () => {
      const [alice, bob] = await inviteParticipants("Alice", "Bob");

      const topic = await engine.topics_api.create("Test");
      await engine.events.create({
        title: "Event",
        description: "Test",
        issues: [
          {
            title: "Issue",
            description: "Test",
            topicIds: [topic.id],
          },
        ],
        eligibleParticipantIds: [alice!, bob!],
        timeline: {
          deliberationStart: timestamp(Date.now()) as Timestamp,
          votingStart: timestamp(Date.now() + 86400000) as Timestamp,
          votingEnd: timestamp(Date.now() + 172800000) as Timestamp,
        },
      });

      const events = await store.getAll();
      // 2 ParticipantRegistered + 1 TopicCreated + 1 VotingEventCreated = 4
      expect(events).toHaveLength(4);

      const types = events.map((e) => e.type);
      expect(types).toContain("ParticipantRegistered");
      expect(types).toContain("TopicCreated");
      expect(types).toContain("VotingEventCreated");
    });
  });
});
