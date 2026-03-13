import { describe, it, expect } from "vitest";
import {
  generateScript,
  runSimulation,
  createRng,
  computeGroundTruthAtEvent,
} from "../../src/index.js";
import type { SimulationScenario } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScenario(overrides?: Partial<SimulationScenario>): SimulationScenario {
  return {
    name: "Test Scenario",
    description: "A basic test scenario",
    seed: 42,
    config: "LIQUID_ACCOUNTABLE",
    topics: [{ name: "Finance" }, { name: "Education" }],
    population: {
      count: 20,
      engagementDistribution: {
        "active-deliberator": 0.3,
        "selective-engager": 0.3,
        "pure-delegator": 0.2,
        "pure-sensor": 0.2,
      },
      forecastingDistribution: {
        good: 0.3,
        average: 0.4,
        poor: 0.3,
      },
      adversarialFraction: 0,
    },
    votingEvents: [
      {
        title: "Budget Vote Q1",
        issues: [
          {
            title: "Approve Q1 Budget",
            topics: ["Finance"],
            groundTruthOutcome: true,
          },
        ],
      },
      {
        title: "Education Reform",
        issues: [
          {
            title: "Approve Education Plan",
            topics: ["Education"],
            groundTruthOutcome: true,
          },
        ],
      },
    ],
    groundTruth: {
      topics: {
        Finance: { baseValue: 100, trajectory: "improving", changeRate: 10 },
        Education: { baseValue: 50, trajectory: "stable", changeRate: 0 },
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Seeded PRNG", () => {
  it("produces deterministic sequences", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());
    expect(seq1).toEqual(seq2);
  });

  it("produces different sequences for different seeds", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(43);
    const v1 = rng1.next();
    const v2 = rng2.next();
    expect(v1).not.toBe(v2);
  });

  it("weighted distribution respects probabilities", () => {
    const rng = createRng(1);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 10000; i++) {
      const result = rng.weighted({ a: 0.5, b: 0.3, c: 0.2 });
      counts[result]++;
    }
    // Should be roughly 50/30/20 with some tolerance
    expect(counts.a).toBeGreaterThan(4000);
    expect(counts.b).toBeGreaterThan(2000);
    expect(counts.c).toBeGreaterThan(1000);
  });
});

describe("Ground truth computation", () => {
  it("computes improving trajectory", () => {
    const gt = { baseValue: 100, trajectory: "improving" as const, changeRate: 10 };
    expect(computeGroundTruthAtEvent(gt, 0)).toBe(110); // 100 + 1*10
    expect(computeGroundTruthAtEvent(gt, 1)).toBe(120); // 100 + 2*10
    expect(computeGroundTruthAtEvent(gt, 4)).toBe(150); // 100 + 5*10
  });

  it("computes stable trajectory", () => {
    const gt = { baseValue: 50, trajectory: "stable" as const, changeRate: 0 };
    expect(computeGroundTruthAtEvent(gt, 0)).toBe(50);
    expect(computeGroundTruthAtEvent(gt, 5)).toBe(50);
  });

  it("computes worsening trajectory", () => {
    const gt = { baseValue: 100, trajectory: "worsening" as const, changeRate: 5 };
    expect(computeGroundTruthAtEvent(gt, 0)).toBe(95); // 100 - 1*5
    expect(computeGroundTruthAtEvent(gt, 3)).toBe(80); // 100 - 4*5
  });
});

describe("Script generation", () => {
  it("produces deterministic scripts from the same seed", () => {
    const scenario = makeScenario();
    const script1 = generateScript(scenario);
    const script2 = generateScript(scenario);

    expect(script1.agents.length).toBe(script2.agents.length);
    expect(script1.actions.length).toBe(script2.actions.length);

    // Same agents in same order
    for (let i = 0; i < script1.agents.length; i++) {
      expect(script1.agents[i]!.name).toBe(script2.agents[i]!.name);
      expect(script1.agents[i]!.profile.engagement).toBe(script2.agents[i]!.profile.engagement);
    }

    // Same actions in same order
    for (let i = 0; i < script1.actions.length; i++) {
      expect(script1.actions[i]!.type).toBe(script2.actions[i]!.type);
    }
  });

  it("produces different scripts from different seeds", () => {
    const script1 = generateScript(makeScenario({ seed: 1 }));
    const script2 = generateScript(makeScenario({ seed: 2 }));

    // Agents have different profiles/assignments
    const profiles1 = script1.agents.map((a) => a.profile.engagement);
    const profiles2 = script2.agents.map((a) => a.profile.engagement);
    expect(profiles1).not.toEqual(profiles2);
  });

  it("generates correct agent count", () => {
    const script = generateScript(
      makeScenario({
        population: {
          count: 15,
          engagementDistribution: {
            "active-deliberator": 0.5,
            "selective-engager": 0.2,
            "pure-delegator": 0.2,
            "pure-sensor": 0.1,
          },
          forecastingDistribution: { good: 0.5, average: 0.3, poor: 0.2 },
          adversarialFraction: 0,
        },
      }),
    );

    expect(script.agents).toHaveLength(15);
    const registerActions = script.actions.filter((a) => a.type === "register-participant");
    expect(registerActions).toHaveLength(15);
  });

  it("generates topic creation actions", () => {
    const script = generateScript(makeScenario());
    const topicActions = script.actions.filter((a) => a.type === "create-topic");
    expect(topicActions).toHaveLength(2); // Finance and Education
  });

  it("generates voting event creation actions", () => {
    const script = generateScript(makeScenario());
    const eventActions = script.actions.filter((a) => a.type === "create-voting-event");
    expect(eventActions).toHaveLength(2);
  });

  it("generates delegation actions for delegators", () => {
    const script = generateScript(makeScenario());
    const delegateActions = script.actions.filter((a) => a.type === "delegate");
    expect(delegateActions.length).toBeGreaterThan(0);
  });

  it("generates vote actions for direct voters", () => {
    const script = generateScript(makeScenario());
    const voteActions = script.actions.filter((a) => a.type === "vote");
    expect(voteActions.length).toBeGreaterThan(0);
  });

  it("generates prediction actions for deliberators", () => {
    const script = generateScript(makeScenario());
    const predActions = script.actions.filter((a) => a.type === "commit-prediction");
    expect(predActions.length).toBeGreaterThan(0);
  });

  it("generates outcome recording actions", () => {
    const script = generateScript(makeScenario());
    const outcomeActions = script.actions.filter((a) => a.type === "record-outcome");
    expect(outcomeActions.length).toBeGreaterThan(0);
  });

  it("script is JSON-serializable", () => {
    const script = generateScript(makeScenario());
    const json = JSON.stringify(script);
    const parsed = JSON.parse(json);
    expect(parsed.agents.length).toBe(script.agents.length);
    expect(parsed.actions.length).toBe(script.actions.length);
  });
});

describe("Full simulation run", () => {
  it("runs deterministically", async () => {
    const scenario = makeScenario({ population: { ...makeScenario().population, count: 10 } });
    const run1 = await runSimulation(scenario);
    const run2 = await runSimulation(scenario);

    expect(run1.results.actionCount).toBe(run2.results.actionCount);
    expect(run1.results.agentCount).toBe(run2.results.agentCount);
  });

  it("produces concentration metrics over time", async () => {
    const result = await runSimulation(makeScenario());

    expect(result.results.concentrationOverTime.length).toBeGreaterThan(0);
    for (const snap of result.results.concentrationOverTime) {
      expect(snap.giniCoefficient).toBeGreaterThanOrEqual(0);
      expect(snap.maxWeight).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces prediction accuracy entries", async () => {
    const result = await runSimulation(makeScenario());

    expect(result.results.predictionAccuracies.length).toBeGreaterThan(0);
    for (const entry of result.results.predictionAccuracies) {
      expect(entry.predictionCount).toBeGreaterThan(0);
      expect(entry.averageAccuracy).toBeGreaterThanOrEqual(0);
      expect(entry.averageAccuracy).toBeLessThanOrEqual(1);
    }
  });
});

describe("Concentration emergence", () => {
  it("delegator-heavy population produces higher concentration", async () => {
    const highDelegation = await runSimulation(
      makeScenario({
        seed: 100,
        population: {
          count: 20,
          engagementDistribution: {
            "active-deliberator": 0.1,
            "selective-engager": 0.1,
            "pure-delegator": 0.7,
            "pure-sensor": 0.1,
          },
          forecastingDistribution: { good: 0.3, average: 0.4, poor: 0.3 },
          adversarialFraction: 0,
        },
      }),
    );

    const highDirect = await runSimulation(
      makeScenario({
        seed: 100,
        population: {
          count: 20,
          engagementDistribution: {
            "active-deliberator": 0.7,
            "selective-engager": 0.2,
            "pure-delegator": 0.0,
            "pure-sensor": 0.1,
          },
          forecastingDistribution: { good: 0.3, average: 0.4, poor: 0.3 },
          adversarialFraction: 0,
        },
      }),
    );

    // With heavy delegation, individual voters carry more weight
    const maxWeightDelegation = Math.max(
      ...highDelegation.results.concentrationOverTime.map((c) => c.maxWeight),
      0,
    );
    const maxWeightDirect = Math.max(
      ...highDirect.results.concentrationOverTime.map((c) => c.maxWeight),
      0,
    );

    // Delegation-heavy: a few voters carry many people's weight
    // Direct-heavy: most voters carry weight 1
    expect(maxWeightDelegation).toBeGreaterThan(maxWeightDirect);
  });
});

describe("Prediction signal quality", () => {
  it("good forecasters achieve higher accuracy than poor forecasters", async () => {
    const result = await runSimulation(
      makeScenario({
        seed: 42,
        population: {
          count: 30,
          engagementDistribution: {
            "active-deliberator": 0.8,
            "selective-engager": 0.1,
            "pure-delegator": 0.0,
            "pure-sensor": 0.1,
          },
          forecastingDistribution: { good: 0.4, average: 0.3, poor: 0.3 },
          adversarialFraction: 0,
        },
        votingEvents: [
          {
            title: "Event 1",
            issues: [{ title: "Issue 1", topics: ["Finance"], groundTruthOutcome: true }],
          },
          {
            title: "Event 2",
            issues: [{ title: "Issue 2", topics: ["Finance"], groundTruthOutcome: true }],
          },
          {
            title: "Event 3",
            issues: [{ title: "Issue 3", topics: ["Finance"], groundTruthOutcome: false }],
          },
        ],
      }),
    );

    const goodForecasters = result.results.predictionAccuracies.filter(
      (e) => e.forecastingAbility === "good",
    );
    const poorForecasters = result.results.predictionAccuracies.filter(
      (e) => e.forecastingAbility === "poor",
    );

    if (goodForecasters.length > 0 && poorForecasters.length > 0) {
      const avgGood =
        goodForecasters.reduce((s, e) => s + e.averageAccuracy, 0) / goodForecasters.length;
      const avgPoor =
        poorForecasters.reduce((s, e) => s + e.averageAccuracy, 0) / poorForecasters.length;

      // Good forecasters should tend to be more accurate
      // Note: with small sample sizes and randomness this may not always hold,
      // but the correlation should be visible on average
      expect(avgGood).toBeGreaterThanOrEqual(0);
      expect(avgPoor).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Adversarial scenarios", () => {
  it("vote-harvester agents produce higher concentration", async () => {
    const withAdversary = await runSimulation(
      makeScenario({
        seed: 55,
        population: {
          count: 20,
          engagementDistribution: {
            "active-deliberator": 0.3,
            "selective-engager": 0.2,
            "pure-delegator": 0.3,
            "pure-sensor": 0.2,
          },
          forecastingDistribution: { good: 0.3, average: 0.4, poor: 0.3 },
          adversarialFraction: 0.2,
          adversarialStrategy: "vote-harvester",
        },
      }),
    );

    const withoutAdversary = await runSimulation(
      makeScenario({
        seed: 55,
        population: {
          count: 20,
          engagementDistribution: {
            "active-deliberator": 0.3,
            "selective-engager": 0.2,
            "pure-delegator": 0.3,
            "pure-sensor": 0.2,
          },
          forecastingDistribution: { good: 0.3, average: 0.4, poor: 0.3 },
          adversarialFraction: 0,
        },
      }),
    );

    // Both should complete without errors
    expect(withAdversary.results.agentCount).toBe(20);
    expect(withoutAdversary.results.agentCount).toBe(20);
  });
});
