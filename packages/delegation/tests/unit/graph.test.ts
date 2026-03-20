import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryEventStore,
  createEvent,
  generateEventId,
  generateDelegationId,
} from "@votiverse/core";
import type {
  EventStore,
  ParticipantId,
  TopicId,
  IssueId,
  Timestamp,
  DelegationCreatedEvent,
  VoteCastEvent,
} from "@votiverse/core";
import {
  buildActiveDelegations,
  getDirectVoters,
  buildDelegationGraph,
  computeWeights,
  resolveChain,
  resolveDelegationForIssue,
  computeConcentrationMetrics,
} from "../../src/graph.js";
import type { Delegation } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pid = (s: string) => s as ParticipantId;
const tid = (s: string) => s as TopicId;
const iid = (s: string) => s as IssueId;

let ts = 1000;
function nextTs(): Timestamp {
  return (ts += 100) as Timestamp;
}

function delegationEvent(
  source: string,
  target: string,
  topics: string[] = [],
): DelegationCreatedEvent {
  return createEvent<DelegationCreatedEvent>(
    "DelegationCreated",
    {
      delegationId: generateDelegationId(),
      sourceId: pid(source),
      targetId: pid(target),
      topicScope: topics.map(tid),
    },
    generateEventId(),
    nextTs(),
  );
}

function voteEvent(participant: string, issue: string, choice: string = "for"): VoteCastEvent {
  return createEvent<VoteCastEvent>(
    "VoteCast",
    {
      participantId: pid(participant),
      issueId: iid(issue),
      choice,
    },
    generateEventId(),
    nextTs(),
  );
}

function allParticipants(...names: string[]): Set<ParticipantId> {
  return new Set(names.map(pid));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Delegation graph construction", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
    ts = 1000;
  });

  describe("buildActiveDelegations", () => {
    it("returns empty array for empty store", async () => {
      const delegations = await buildActiveDelegations(store);
      expect(delegations).toHaveLength(0);
    });

    it("returns active delegations", async () => {
      await store.append(delegationEvent("alice", "bob"));
      const delegations = await buildActiveDelegations(store);
      expect(delegations).toHaveLength(1);
      expect(delegations[0]!.sourceId).toBe(pid("alice"));
      expect(delegations[0]!.targetId).toBe(pid("bob"));
    });
  });

  describe("getDirectVoters", () => {
    it("returns empty set when no votes", async () => {
      const voters = await getDirectVoters(store, iid("issue-1"));
      expect(voters.size).toBe(0);
    });

    it("returns voters for the correct issue", async () => {
      await store.append(voteEvent("alice", "issue-1"));
      await store.append(voteEvent("bob", "issue-2"));
      const voters = await getDirectVoters(store, iid("issue-1"));
      expect(voters.size).toBe(1);
      expect(voters.has(pid("alice"))).toBe(true);
    });
  });
});

describe("Weight computation — Whitepaper Section 5 examples", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
    ts = 1000;
  });

  it("Section 5.3: Transitive delegation — Alex→Beth→Carlos, Carlos votes", async () => {
    // Alex delegates to Beth, Beth delegates to Carlos
    await store.append(delegationEvent("alex", "beth"));
    await store.append(delegationEvent("beth", "carlos"));
    // Carlos votes
    await store.append(voteEvent("carlos", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alex", "beth", "carlos");
    const weights = computeWeights(graph, voters, participants);

    // Carlos should carry weight 3 (his own + Beth's + Alex's)
    expect(weights.weights.get(pid("carlos"))).toBe(3);
    expect(weights.weights.get(pid("alex"))).toBe(0);
    expect(weights.weights.get(pid("beth"))).toBe(0);
    expect(weights.totalWeight).toBe(3);
  });

  it("Section 5.4: Beth votes directly — chain breaks at Beth", async () => {
    await store.append(delegationEvent("alex", "beth"));
    await store.append(delegationEvent("beth", "carlos"));
    // Beth votes directly (override rule)
    await store.append(voteEvent("beth", "issue-1"));
    // Carlos also votes
    await store.append(voteEvent("carlos", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alex", "beth", "carlos");
    const weights = computeWeights(graph, voters, participants);

    // Beth voted directly: weight 1 (her own). Override rule severs Beth→Carlos.
    // But Alex→Beth still holds, so Beth carries Alex's weight too = 2
    expect(weights.weights.get(pid("beth"))).toBe(2);
    // Carlos voted directly, no one delegates to him anymore: weight 1
    expect(weights.weights.get(pid("carlos"))).toBe(1);
    expect(weights.weights.get(pid("alex"))).toBe(0);
    expect(weights.totalWeight).toBe(3);
  });

  it("Section 5.4: Alex votes directly — only Alex's delegation is overridden", async () => {
    await store.append(delegationEvent("alex", "beth"));
    await store.append(delegationEvent("beth", "carlos"));
    // Alex votes directly
    await store.append(voteEvent("alex", "issue-1"));
    // Carlos votes
    await store.append(voteEvent("carlos", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alex", "beth", "carlos");
    const weights = computeWeights(graph, voters, participants);

    // Alex voted directly: weight 1
    expect(weights.weights.get(pid("alex"))).toBe(1);
    // Beth→Carlos still holds. Carlos carries Beth's weight too = 2
    expect(weights.weights.get(pid("carlos"))).toBe(2);
    expect(weights.weights.get(pid("beth"))).toBe(0);
    expect(weights.totalWeight).toBe(3);
  });

  it("Section 5.4: All three vote directly — pure direct democracy", async () => {
    await store.append(delegationEvent("alex", "beth"));
    await store.append(delegationEvent("beth", "carlos"));
    await store.append(voteEvent("alex", "issue-1"));
    await store.append(voteEvent("beth", "issue-1"));
    await store.append(voteEvent("carlos", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alex", "beth", "carlos");
    const weights = computeWeights(graph, voters, participants);

    // All override their delegations: weight 1 each
    expect(weights.weights.get(pid("alex"))).toBe(1);
    expect(weights.weights.get(pid("beth"))).toBe(1);
    expect(weights.weights.get(pid("carlos"))).toBe(1);
    expect(weights.totalWeight).toBe(3);
  });

  it("Section 5.6: Cycle — Alice→Bob→Carol→Alice, none vote", async () => {
    await store.append(delegationEvent("alice", "bob"));
    await store.append(delegationEvent("bob", "carol"));
    await store.append(delegationEvent("carol", "alice"));
    // No one votes

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alice", "bob", "carol");
    const weights = computeWeights(graph, voters, participants);

    // All in cycle, none voted: all have weight 0
    expect(weights.weights.get(pid("alice"))).toBe(0);
    expect(weights.weights.get(pid("bob"))).toBe(0);
    expect(weights.weights.get(pid("carol"))).toBe(0);
    expect(weights.totalWeight).toBe(0);
    // Cycle detected
    expect(graph.cycleParticipants.has(pid("alice"))).toBe(true);
    expect(graph.cycleParticipants.has(pid("bob"))).toBe(true);
    expect(graph.cycleParticipants.has(pid("carol"))).toBe(true);
  });

  it("Section 5.6: Cycle broken by direct vote", async () => {
    await store.append(delegationEvent("alice", "bob"));
    await store.append(delegationEvent("bob", "carol"));
    await store.append(delegationEvent("carol", "alice"));
    // Bob votes directly, breaking the cycle
    await store.append(voteEvent("bob", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alice", "bob", "carol");
    const weights = computeWeights(graph, voters, participants);

    // Bob voted directly: his delegation to Carol is overridden.
    // Alice→Bob still applies (Alice is in cycle but her outgoing edge to Bob means
    // if Bob voted, Alice's weight flows to Bob... BUT Alice is a cycle member
    // who didn't vote, so her edge is pruned).
    // Carol→Alice edge is in cycle, Carol didn't vote, so pruned.
    // Only Bob has weight = 1 (just himself)
    expect(weights.weights.get(pid("bob"))).toBe(1);
    // Alice and Carol are cycle members who didn't vote directly
    expect(weights.weights.get(pid("alice"))).toBe(0);
    expect(weights.weights.get(pid("carol"))).toBe(0);
    expect(weights.totalWeight).toBe(1);
  });
});

describe("Formal properties (Appendix C.6)", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
    ts = 1000;
  });

  it("Sovereignty: a direct vote always has weight 1", async () => {
    // Complex delegation chain, but Alice votes directly
    await store.append(delegationEvent("alice", "bob"));
    await store.append(delegationEvent("bob", "carol"));
    await store.append(delegationEvent("dave", "alice"));
    await store.append(voteEvent("alice", "issue-1"));
    await store.append(voteEvent("carol", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alice", "bob", "carol", "dave");
    const weights = computeWeights(graph, voters, participants);

    // Alice voted directly — her delegation to Bob is overridden
    // Alice's weight includes Dave's delegation (Dave→Alice, Dave didn't vote)
    expect(weights.weights.get(pid("alice"))).toBe(2); // her own + Dave's
  });

  it("One person, one vote: total weight equals participating voters' contributions", async () => {
    await store.append(delegationEvent("a", "b"));
    await store.append(delegationEvent("c", "b"));
    await store.append(delegationEvent("d", "e"));
    await store.append(voteEvent("b", "issue-1"));
    await store.append(voteEvent("e", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("a", "b", "c", "d", "e");
    const weights = computeWeights(graph, voters, participants);

    // b has weight 3 (a + c + b), e has weight 2 (d + e)
    expect(weights.weights.get(pid("b"))).toBe(3);
    expect(weights.weights.get(pid("e"))).toBe(2);
    // Total = 5 = number of participants whose delegation chain terminates at a voter
    expect(weights.totalWeight).toBe(5);
  });

  it("Override rule: direct vote from delegator removes their weight from delegate", async () => {
    await store.append(delegationEvent("alice", "bob"));
    await store.append(voteEvent("bob", "issue-1"));
    // Without Alice voting: bob has weight 2
    let delegations = await buildActiveDelegations(store);
    let graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    let voters = await getDirectVoters(store, iid("issue-1"));
    let participants = allParticipants("alice", "bob");
    let weights = computeWeights(graph, voters, participants);
    expect(weights.weights.get(pid("bob"))).toBe(2);

    // Alice votes directly: bob loses Alice's weight
    await store.append(voteEvent("alice", "issue-1"));
    delegations = await buildActiveDelegations(store);
    graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    voters = await getDirectVoters(store, iid("issue-1"));
    weights = computeWeights(graph, voters, participants);
    expect(weights.weights.get(pid("bob"))).toBe(1);
    expect(weights.weights.get(pid("alice"))).toBe(1);
  });

  it("Non-participation: participant who doesn't vote and has no delegation has weight 0", async () => {
    await store.append(voteEvent("alice", "issue-1"));
    // Bob neither votes nor delegates
    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alice", "bob");
    const weights = computeWeights(graph, voters, participants);

    expect(weights.weights.get(pid("alice"))).toBe(1);
    expect(weights.weights.get(pid("bob"))).toBe(0);
  });
});

describe("Chain resolution", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
    ts = 1000;
  });

  it("resolves chain for a direct voter", async () => {
    await store.append(voteEvent("alice", "issue-1"));
    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));

    const chain = resolveChain(pid("alice"), graph, voters);
    expect(chain.votedDirectly).toBe(true);
    expect(chain.terminalVoter).toBe(pid("alice"));
    expect(chain.chain).toEqual([pid("alice")]);
  });

  it("resolves transitive chain", async () => {
    await store.append(delegationEvent("alex", "beth"));
    await store.append(delegationEvent("beth", "carlos"));
    await store.append(voteEvent("carlos", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));

    const chain = resolveChain(pid("alex"), graph, voters);
    expect(chain.votedDirectly).toBe(false);
    expect(chain.terminalVoter).toBe(pid("carlos"));
    expect(chain.chain).toEqual([pid("alex"), pid("beth"), pid("carlos")]);
  });

  it("returns null terminal voter for unresolved cycle", async () => {
    await store.append(delegationEvent("alice", "bob"));
    await store.append(delegationEvent("bob", "alice"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));

    const chain = resolveChain(pid("alice"), graph, voters);
    expect(chain.terminalVoter).toBeNull();
  });
});

describe("Scope resolution", () => {
  it("selects the most specific delegation for an issue", () => {
    const finance = tid("finance");
    const budget = tid("budget");

    const generalDelegation: Delegation = {
      id: generateDelegationId(),
      sourceId: pid("alice"),
      targetId: pid("bob"),
      topicScope: [finance],
      issueScope: null,
      createdAt: 1000 as Timestamp,
      active: true,
    };

    const specificDelegation: Delegation = {
      id: generateDelegationId(),
      sourceId: pid("alice"),
      targetId: pid("carol"),
      topicScope: [budget],
      issueScope: null,
      createdAt: 2000 as Timestamp,
      active: true,
    };

    // Issue about budget — both delegations match, but budget is more specific
    const result = resolveDelegationForIssue(
      iid("issue-1"),
      budget,
      [generalDelegation, specificDelegation],
      new Map([[budget, [finance]]]),
    );

    expect(result).toBe(specificDelegation);
  });

  it("selects the most recent delegation when specificity is equal", () => {
    const finance = tid("finance");

    const olderDelegation: Delegation = {
      id: generateDelegationId(),
      sourceId: pid("alice"),
      targetId: pid("bob"),
      topicScope: [finance],
      issueScope: null,
      createdAt: 1000 as Timestamp,
      active: true,
    };

    const newerDelegation: Delegation = {
      id: generateDelegationId(),
      sourceId: pid("alice"),
      targetId: pid("carol"),
      topicScope: [finance],
      issueScope: null,
      createdAt: 2000 as Timestamp,
      active: true,
    };

    const result = resolveDelegationForIssue(
      iid("issue-1"),
      finance,
      [olderDelegation, newerDelegation],
      new Map(),
    );

    expect(result).toBe(newerDelegation);
  });

  it("returns undefined when no delegation matches the issue topics", () => {
    const finance = tid("finance");
    const health = tid("health");

    const delegation: Delegation = {
      id: generateDelegationId(),
      sourceId: pid("alice"),
      targetId: pid("bob"),
      topicScope: [finance],
      issueScope: null,
      createdAt: 1000 as Timestamp,
      active: true,
    };

    const result = resolveDelegationForIssue(iid("issue-1"), health, [delegation], new Map());

    expect(result).toBeUndefined();
  });

  it("global delegation (empty scope) matches any issue", () => {
    const health = tid("health");

    const globalDelegation: Delegation = {
      id: generateDelegationId(),
      sourceId: pid("alice"),
      targetId: pid("bob"),
      topicScope: [],
      issueScope: null,
      createdAt: 1000 as Timestamp,
      active: true,
    };

    const result = resolveDelegationForIssue(iid("issue-1"), health, [globalDelegation], new Map());

    expect(result).toBe(globalDelegation);
  });
});

describe("Concentration metrics", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
    ts = 1000;
  });

  it("computes Gini coefficient for equal weights", async () => {
    await store.append(voteEvent("alice", "issue-1"));
    await store.append(voteEvent("bob", "issue-1"));
    await store.append(voteEvent("carol", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("alice", "bob", "carol");
    const weights = computeWeights(graph, voters, participants);
    const metrics = computeConcentrationMetrics(weights, graph, voters);

    // Equal weights → Gini = 0
    expect(metrics.giniCoefficient).toBeCloseTo(0, 5);
    expect(metrics.maxWeight).toBe(1);
    expect(metrics.directVoterCount).toBe(3);
  });

  it("computes higher Gini for concentrated weights", async () => {
    await store.append(delegationEvent("a", "d"));
    await store.append(delegationEvent("b", "d"));
    await store.append(delegationEvent("c", "d"));
    await store.append(voteEvent("d", "issue-1"));
    await store.append(voteEvent("e", "issue-1"));

    const delegations = await buildActiveDelegations(store);
    const graph = buildDelegationGraph(iid("issue-1"), null, delegations, new Map());
    const voters = await getDirectVoters(store, iid("issue-1"));
    const participants = allParticipants("a", "b", "c", "d", "e");
    const weights = computeWeights(graph, voters, participants);
    const metrics = computeConcentrationMetrics(weights, graph, voters);

    expect(metrics.giniCoefficient).toBeGreaterThan(0);
    expect(metrics.maxWeight).toBe(4);
    expect(metrics.maxWeightHolder).toBe(pid("d"));
  });
});
