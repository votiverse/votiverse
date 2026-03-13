/**
 * @votiverse/simulate — Generation phase
 *
 * Given a scenario definition and a random seed, generates the complete
 * sequence of governance actions as a deterministic script. This is
 * pure computation with no engine dependency.
 */

import type { Timestamp } from "@votiverse/core";
import type { PredictionClaim } from "@votiverse/prediction";
import { createRng } from "./random.js";
import type { Rng } from "./random.js";
import type {
  SimulationScenario,
  SimulatedAgent,
  SimulationScript,
  SimulationAction,
  AgentProfile,
  EngagementPattern,
  ForecastingAbility,
  TrustHeuristic,
  GroundTruthTopic,
} from "./types.js";

// ---------------------------------------------------------------------------
// Agent names
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank",
  "Iris", "Jack", "Karen", "Leo", "Mia", "Noah", "Olivia", "Pete",
  "Quinn", "Rosa", "Sam", "Tina", "Uma", "Vic", "Wendy", "Xander",
  "Yara", "Zach",
];

function generateAgentName(index: number): string {
  if (index < FIRST_NAMES.length) return FIRST_NAMES[index]!;
  return `Agent_${index + 1}`;
}

// ---------------------------------------------------------------------------
// Population generation
// ---------------------------------------------------------------------------

function generateAgents(
  scenario: SimulationScenario,
  rng: Rng,
): SimulatedAgent[] {
  const { population, topics } = scenario;
  const agents: SimulatedAgent[] = [];
  const topicNames = topics.map((t) => t.name);

  for (let i = 0; i < population.count; i++) {
    const engagement = rng.weighted(population.engagementDistribution);
    const forecastingAbility = rng.weighted(population.forecastingDistribution);

    // Each agent cares about 1-3 topics
    const interestCount = rng.int(1, Math.min(3, topicNames.length || 1));
    const shuffledTopics = rng.shuffle([...topicNames]);
    const topicInterests = shuffledTopics.slice(0, interestCount);

    const trustHeuristic = rng.pick<TrustHeuristic>([
      "highest-track-record",
      "most-active",
      "random",
      "topic-expert",
    ]);

    const pollReliability = engagement === "pure-sensor" ? 0.8 + rng.next() * 0.2 : 0.5 + rng.next() * 0.3;

    const isAdversarial = rng.chance(population.adversarialFraction);
    const adversarial = isAdversarial
      ? population.adversarialStrategy ?? "vote-harvester"
      : undefined;

    const profile: AgentProfile = {
      engagement: isAdversarial ? "active-deliberator" : engagement,
      topicInterests,
      trustHeuristic: isAdversarial ? "random" : trustHeuristic,
      forecastingAbility: isAdversarial ? "poor" : forecastingAbility,
      pollReliability,
      adversarial,
    };

    agents.push({ name: generateAgentName(i), profile });
  }

  return agents;
}

// ---------------------------------------------------------------------------
// Action generation
// ---------------------------------------------------------------------------

/**
 * Generates the complete action script for a simulation scenario.
 */
export function generateScript(scenario: SimulationScenario): SimulationScript {
  const rng = createRng(scenario.seed);
  const agents = generateAgents(scenario, rng);
  const actions: SimulationAction[] = [];

  // Phase 1: Register all participants
  for (const agent of agents) {
    actions.push({ type: "register-participant", name: agent.name });
  }

  // Phase 2: Create topics
  for (const topic of scenario.topics) {
    actions.push({
      type: "create-topic",
      name: topic.name,
      parentName: topic.parent,
    });
  }

  // Phase 3: Generate actions for each voting event
  for (let eventIdx = 0; eventIdx < scenario.votingEvents.length; eventIdx++) {
    const eventSpec = scenario.votingEvents[eventIdx]!;

    // Create the voting event
    actions.push({
      type: "create-voting-event",
      title: eventSpec.title,
      issues: eventSpec.issues.map((issue) => ({
        title: issue.title,
        topicNames: [...issue.topics],
      })),
    });

    // Determine delegation and voting behavior per agent
    generateEventActions(
      agents,
      eventSpec,
      eventIdx,
      scenario,
      rng,
      actions,
    );
  }

  return { scenario, agents, actions };
}

function generateEventActions(
  agents: readonly SimulatedAgent[],
  eventSpec: SimulationScenario["votingEvents"][number],
  eventIndex: number,
  scenario: SimulationScenario,
  rng: Rng,
  actions: SimulationAction[],
): void {
  // Track who is delegating and who will vote directly for this event
  const directVoters = new Set<string>();
  const delegators = new Map<string, string>(); // source → target

  // Determine behavior per agent
  for (const agent of agents) {
    const willVoteDirectly = decideDirectVote(agent, eventSpec, rng);
    if (willVoteDirectly) {
      directVoters.add(agent.name);
    }
  }

  // Generate delegations for non-direct-voters
  for (const agent of agents) {
    if (directVoters.has(agent.name)) continue;
    if (agent.profile.engagement === "pure-sensor") continue;

    // Pick a delegate
    const target = pickDelegate(agent, agents, directVoters, rng);
    if (target && target !== agent.name) {
      const topicNames = getRelevantTopics(agent, eventSpec);
      actions.push({
        type: "delegate",
        sourceName: agent.name,
        targetName: target,
        topicNames,
      });
      delegators.set(agent.name, target);
    }
  }

  // Handle adversarial vote harvesters: re-delegate accumulated delegations
  for (const agent of agents) {
    if (agent.profile.adversarial !== "vote-harvester") continue;
    // Harvester: delegate their own accumulated weight to a "co-conspirator"
    // Pick another adversarial agent or a random agent
    const otherAdversarial = agents.find(
      (a) =>
        a.name !== agent.name &&
        a.profile.adversarial === "vote-harvester",
    );
    if (otherAdversarial && !delegators.has(agent.name)) {
      actions.push({
        type: "delegate",
        sourceName: agent.name,
        targetName: otherAdversarial.name,
        topicNames: [],
      });
    }
  }

  // Generate votes for direct voters
  for (const issue of eventSpec.issues) {
    const issueIdx = eventSpec.issues.indexOf(issue);
    for (const voterName of directVoters) {
      const agent = agents.find((a) => a.name === voterName)!;
      const choice = decideVote(agent, issue, rng);
      actions.push({
        type: "vote",
        participantName: voterName,
        eventIndex,
        issueIndex: issueIdx,
        choice,
      });
    }
  }

  // Generate predictions from active deliberators and selective engagers
  for (const agent of agents) {
    if (
      agent.profile.engagement !== "active-deliberator" &&
      agent.profile.engagement !== "selective-engager"
    ) {
      continue;
    }
    if (agent.profile.adversarial === "vague-predictor") {
      // Generate vague, unfalsifiable predictions
      for (let issueIdx = 0; issueIdx < eventSpec.issues.length; issueIdx++) {
        actions.push({
          type: "commit-prediction",
          participantName: agent.name,
          eventIndex,
          issueIndex: issueIdx,
          claim: generateVaguePrediction(rng),
        });
      }
      continue;
    }

    // Normal prediction generation
    for (let issueIdx = 0; issueIdx < eventSpec.issues.length; issueIdx++) {
      const issue = eventSpec.issues[issueIdx]!;
      if (!rng.chance(0.6)) continue; // Not everyone predicts every issue
      const claim = generatePrediction(
        agent,
        issue,
        eventIndex,
        scenario.groundTruth,
        rng,
      );
      actions.push({
        type: "commit-prediction",
        participantName: agent.name,
        eventIndex,
        issueIndex: issueIdx,
        claim,
      });
    }
  }

  // Generate poll responses from sensors and engaged participants
  for (const agent of agents) {
    if (agent.profile.engagement === "pure-delegator") continue;
    if (!rng.chance(0.7)) continue; // Not everyone responds to every poll

    const answers: { questionText: string; value: number | string | boolean }[] = [];
    for (const issue of eventSpec.issues) {
      for (const topicName of issue.topics) {
        const gt = scenario.groundTruth.topics[topicName];
        if (!gt) continue;
        const trueValue = computeGroundTruthAtEvent(gt, eventIndex);
        // Agent reports with noise based on their reliability
        const noise = (1 - agent.profile.pollReliability) * rng.normal(0, 1);
        const reportedValue = trueValue + noise;
        // Map to direction response
        const direction = reportedValue > 0.1 ? "improved" : reportedValue < -0.1 ? "worsened" : "same";
        answers.push({
          questionText: `Has ${topicName} improved, stayed the same, or worsened?`,
          value: direction,
        });
      }
    }

    if (answers.length > 0) {
      actions.push({
        type: "poll-respond",
        participantName: agent.name,
        eventIndex,
        answers,
      });
    }
  }

  // Generate outcome recordings (based on ground truth)
  for (let issueIdx = 0; issueIdx < eventSpec.issues.length; issueIdx++) {
    const issue = eventSpec.issues[issueIdx]!;
    const mainTopic = issue.topics[0];
    if (!mainTopic) continue;
    const gt = scenario.groundTruth.topics[mainTopic];
    if (!gt) continue;
    const value = computeGroundTruthAtEvent(gt, eventIndex);
    actions.push({
      type: "record-outcome",
      eventIndex,
      issueIndex: issueIdx,
      measuredValue: value,
    });
  }
}

// ---------------------------------------------------------------------------
// Agent decision functions
// ---------------------------------------------------------------------------

function decideDirectVote(
  agent: SimulatedAgent,
  eventSpec: SimulationScenario["votingEvents"][number],
  rng: Rng,
): boolean {
  switch (agent.profile.engagement) {
    case "active-deliberator":
      return true; // Always votes directly
    case "selective-engager": {
      // Vote directly if the issue touches their interests
      const touches = eventSpec.issues.some((issue) =>
        issue.topics.some((t) => agent.profile.topicInterests.includes(t)),
      );
      return touches ? rng.chance(0.7) : rng.chance(0.2);
    }
    case "pure-delegator":
      return false; // Never votes directly
    case "pure-sensor":
      return false; // Only responds to polls
  }
}

function pickDelegate(
  agent: SimulatedAgent,
  allAgents: readonly SimulatedAgent[],
  directVoters: ReadonlySet<string>,
  rng: Rng,
): string | undefined {
  // Filter candidates: must be a direct voter, not self
  const candidates = allAgents.filter(
    (a) => a.name !== agent.name && directVoters.has(a.name),
  );
  if (candidates.length === 0) return undefined;

  switch (agent.profile.trustHeuristic) {
    case "highest-track-record":
      // Prefer agents with good forecasting ability
      return pickByForecasting(candidates, "good", rng);
    case "most-active":
      // Prefer active deliberators
      return pickByEngagement(candidates, "active-deliberator", rng);
    case "topic-expert":
      // Prefer agents with overlapping topic interests
      return pickByTopicOverlap(agent, candidates, rng);
    case "random":
      return rng.pick(candidates).name;
  }
}

function pickByForecasting(
  candidates: readonly SimulatedAgent[],
  preferred: ForecastingAbility,
  rng: Rng,
): string {
  const preferredAgents = candidates.filter(
    (a) => a.profile.forecastingAbility === preferred,
  );
  if (preferredAgents.length > 0) return rng.pick(preferredAgents).name;
  return rng.pick(candidates).name;
}

function pickByEngagement(
  candidates: readonly SimulatedAgent[],
  preferred: EngagementPattern,
  rng: Rng,
): string {
  const preferredAgents = candidates.filter(
    (a) => a.profile.engagement === preferred,
  );
  if (preferredAgents.length > 0) return rng.pick(preferredAgents).name;
  return rng.pick(candidates).name;
}

function pickByTopicOverlap(
  agent: SimulatedAgent,
  candidates: readonly SimulatedAgent[],
  rng: Rng,
): string {
  const withOverlap = candidates.filter((c) =>
    c.profile.topicInterests.some((t) =>
      agent.profile.topicInterests.includes(t),
    ),
  );
  if (withOverlap.length > 0) return rng.pick(withOverlap).name;
  return rng.pick(candidates).name;
}

function decideVote(
  agent: SimulatedAgent,
  issue: SimulationScenario["votingEvents"][number]["issues"][number],
  rng: Rng,
): string {
  // Good forecasters tend to vote with ground truth
  // Poor forecasters are essentially random
  const correctProb =
    agent.profile.forecastingAbility === "good"
      ? 0.8
      : agent.profile.forecastingAbility === "average"
        ? 0.55
        : 0.35;
  const voteCorrectly = rng.chance(correctProb);
  const outcome = issue.groundTruthOutcome;

  if (voteCorrectly) {
    return outcome ? "for" : "against";
  }
  return outcome ? "against" : "for";
}

function getRelevantTopics(
  agent: SimulatedAgent,
  eventSpec: SimulationScenario["votingEvents"][number],
): string[] {
  const eventTopics = new Set<string>();
  for (const issue of eventSpec.issues) {
    for (const t of issue.topics) {
      eventTopics.add(t);
    }
  }
  // Use agent's topic interests if they overlap, otherwise use all event topics
  const overlapping = agent.profile.topicInterests.filter((t) =>
    eventTopics.has(t),
  );
  return overlapping.length > 0 ? overlapping : [...eventTopics];
}

// ---------------------------------------------------------------------------
// Prediction generation
// ---------------------------------------------------------------------------

function generatePrediction(
  agent: SimulatedAgent,
  issue: SimulationScenario["votingEvents"][number]["issues"][number],
  eventIndex: number,
  groundTruth: SimulationScenario["groundTruth"],
  rng: Rng,
): PredictionClaim {
  const mainTopic = issue.topics[0] ?? "general";
  const gt = groundTruth.topics[mainTopic];
  const baseValue = gt?.baseValue ?? 50;
  const trueChange = gt ? gt.changeRate * (eventIndex + 1) : 0;

  // Agent's prediction accuracy depends on their forecasting ability
  const noiseMultiplier =
    agent.profile.forecastingAbility === "good"
      ? 0.2
      : agent.profile.forecastingAbility === "average"
        ? 0.5
        : 1.0;

  const predictedChange =
    trueChange + trueChange * noiseMultiplier * rng.normal(0, 1);

  return {
    variable: mainTopic,
    baselineValue: baseValue,
    timeframe: {
      start: (1000 + eventIndex * 100000) as Timestamp,
      deadline: (1000 + (eventIndex + 1) * 100000) as Timestamp,
    },
    pattern: {
      type: "absolute-change",
      expected: predictedChange,
    },
  };
}

function generateVaguePrediction(rng: Rng): PredictionClaim {
  // Adversarial: generate binary predictions on vague variables
  return {
    variable: "overall situation",
    timeframe: {
      start: 0 as Timestamp,
      deadline: (Date.now() + 365 * 86400000) as Timestamp, // far future
    },
    pattern: {
      type: "binary",
      expectedOutcome: rng.chance(0.5),
    },
  };
}

// ---------------------------------------------------------------------------
// Ground truth computation
// ---------------------------------------------------------------------------

/**
 * Computes the ground truth value for a topic at a given event index.
 */
export function computeGroundTruthAtEvent(
  gt: GroundTruthTopic,
  eventIndex: number,
): number {
  const direction =
    gt.trajectory === "improving" ? 1 : gt.trajectory === "worsening" ? -1 : 0;
  return gt.baseValue + direction * gt.changeRate * (eventIndex + 1);
}
