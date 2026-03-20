/**
 * @votiverse/simulate — Playback phase
 *
 * Feeds a generated action script into a real VotiverseEngine instance,
 * event by event. The engine processes them exactly as it would real
 * user actions. After playback, metrics are extracted from the engine.
 */

import type {
  ParticipantId,
  TopicId,
  IssueId,
  SurveyId,
  PredictionId,
  ProposalId,
  Timestamp,
} from "@votiverse/core";
import { InMemoryEventStore, isOk, timestamp } from "@votiverse/core";
import type { GovernanceConfig, PresetName } from "@votiverse/config";
import { getPreset } from "@votiverse/config";
import { createEngine } from "@votiverse/engine";
import type { VotiverseEngine } from "@votiverse/engine";
import { InvitationProvider } from "@votiverse/identity";
import type {
  SimulationScript,
  SimulationAction,
  SimulationResults,
  ConcentrationSnapshot,
  PredictionAccuracyEntry,
} from "./types.js";

// ---------------------------------------------------------------------------
// Playback state (maps names to IDs)
// ---------------------------------------------------------------------------

interface PlaybackState {
  engine: VotiverseEngine;
  store: InMemoryEventStore;
  provider: InvitationProvider;
  participantIds: Map<string, ParticipantId>;
  topicIds: Map<string, TopicId>;
  issueIds: Map<string, IssueId>; // keyed by "eventIdx:issueIdx"
  predictionIds: Map<string, PredictionId>; // keyed by "participantName:eventIdx:issueIdx"
  surveyIds: Map<number, SurveyId>; // keyed by eventIndex
  concentrationSnapshots: ConcentrationSnapshot[];
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

/**
 * Plays back a simulation script through the real engine.
 * Returns the engine state and extracted metrics.
 */
export async function playback(
  script: SimulationScript,
): Promise<{ engine: VotiverseEngine; results: SimulationResults }> {
  const config = resolveConfig(script.scenario.config);
  const store = new InMemoryEventStore();
  const provider = new InvitationProvider(store);
  const engine = createEngine({
    config,
    eventStore: store,
    identityProvider: provider,
  });

  const state: PlaybackState = {
    engine,
    store,
    provider,
    participantIds: new Map(),
    topicIds: new Map(),
    issueIds: new Map(),
    predictionIds: new Map(),
    surveyIds: new Map(),
    concentrationSnapshots: [],
  };

  // Execute each action
  let lastEventIndex = -1;
  for (const action of script.actions) {
    // Track event transitions for post-event metrics
    if ("eventIndex" in action && action.eventIndex !== lastEventIndex) {
      if (lastEventIndex >= 0) {
        await captureEventMetrics(state, lastEventIndex);
      }
      lastEventIndex = action.eventIndex;
    }

    await executeAction(state, action);
  }

  // Capture final event metrics
  if (lastEventIndex >= 0) {
    await captureEventMetrics(state, lastEventIndex);
  }

  // Compute final results
  const predictionAccuracies = await computePredictionAccuracies(state, script);

  const results: SimulationResults = {
    scenarioName: script.scenario.name,
    agentCount: script.agents.length,
    eventCount: script.scenario.votingEvents.length,
    concentrationOverTime: state.concentrationSnapshots,
    predictionAccuracies,
    actionCount: script.actions.length,
  };

  return { engine, results };
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

async function executeAction(state: PlaybackState, action: SimulationAction): Promise<void> {
  switch (action.type) {
    case "register-participant": {
      const result = await state.provider.invite(action.name);
      if (isOk(result)) {
        state.participantIds.set(action.name, result.value.id);
      }
      break;
    }

    case "create-topic": {
      const parentId = action.parentName ? state.topicIds.get(action.parentName) : undefined;
      const topic = await state.engine.topics_api.create(action.name, parentId);
      state.topicIds.set(action.name, topic.id);
      break;
    }

    case "create-voting-event": {
      const allParticipantIds = [...state.participantIds.values()];
      const now = Date.now();
      const eventIdx =
        state.issueIds.size > 0
          ? Math.max(...[...state.issueIds.keys()].map((k) => parseInt(k.split(":")[0]!, 10))) + 1
          : 0;

      const votingEvent = await state.engine.events.create({
        title: action.title,
        description: action.title,
        issues: action.issues.map((issue) => ({
          title: issue.title,
          description: issue.title,
          topicId: issue.topicNames
            .map((n) => state.topicIds.get(n))
            .find((id): id is TopicId => id !== undefined) ?? null,
        })),
        eligibleParticipantIds: allParticipantIds,
        timeline: {
          deliberationStart: timestamp(now) as Timestamp,
          votingStart: timestamp(now) as Timestamp,
          votingEnd: timestamp(now + 7 * 86400000) as Timestamp,
        },
      });

      // Map issue indices to IDs
      for (let i = 0; i < votingEvent.issueIds.length; i++) {
        state.issueIds.set(`${eventIdx}:${i}`, votingEvent.issueIds[i]!);
      }

      break;
    }

    case "delegate": {
      const sourceId = state.participantIds.get(action.sourceName);
      const targetId = state.participantIds.get(action.targetName);
      if (!sourceId || !targetId) break;

      const topicScope = action.topicNames
        .map((n) => state.topicIds.get(n))
        .filter((id): id is TopicId => id !== undefined);

      try {
        await state.engine.delegation.create({
          sourceId,
          targetId,
          topicScope,
        });
      } catch {
        // May fail if delegation already exists or is disabled
      }
      break;
    }

    case "vote": {
      const participantId = state.participantIds.get(action.participantName);
      const issueId = state.issueIds.get(`${action.eventIndex}:${action.issueIndex}`);
      if (!participantId || !issueId) break;

      try {
        await state.engine.voting.cast(participantId, issueId, action.choice);
      } catch {
        // May fail on duplicates
      }
      break;
    }

    case "commit-prediction": {
      const participantId = state.participantIds.get(action.participantName);
      if (!participantId) break;

      try {
        const prediction = await state.engine.prediction.commit({
          participantId,
          proposalId:
            `proposal-${action.eventIndex}-${action.issueIndex}` as ProposalId,
          claim: action.claim,
        });
        state.predictionIds.set(
          `${action.participantName}:${action.eventIndex}:${action.issueIndex}`,
          prediction.id,
        );
      } catch {
        // May fail if predictions disabled
      }
      break;
    }

    case "record-outcome": {
      // Find all predictions for this event/issue and record outcomes
      for (const [key, predId] of state.predictionIds) {
        const [_, eventStr, issueStr] = key.split(":");
        if (eventStr === String(action.eventIndex) && issueStr === String(action.issueIndex)) {
          try {
            await state.engine.prediction.recordOutcome({
              predictionId: predId,
              source: { type: "official", provider: "simulation-ground-truth" },
              measuredValue: action.measuredValue,
            });
          } catch {
            // May fail on duplicates or missing predictions
          }
        }
      }
      break;
    }

    case "survey-respond": {
      // Surveys are created automatically during voting event creation
      // For simulation, we skip survey responses since the survey package
      // requires a real survey to exist first. The survey integration is
      // tested via evaluateFromTrend in the prediction package.
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Metrics capture
// ---------------------------------------------------------------------------

async function captureEventMetrics(state: PlaybackState, eventIndex: number): Promise<void> {
  // Find all issues for this event and compute concentration
  for (const [key, issueId] of state.issueIds) {
    if (!key.startsWith(`${eventIndex}:`)) continue;

    try {
      const concentration = await state.engine.delegation.concentration(issueId);
      const maxWeightName = concentration.maxWeightHolder
        ? findNameById(state, concentration.maxWeightHolder)
        : "none";

      state.concentrationSnapshots.push({
        eventIndex,
        giniCoefficient: concentration.giniCoefficient,
        maxWeight: concentration.maxWeight,
        maxWeightHolder: maxWeightName,
      });
    } catch {
      // May fail if issue doesn't exist yet
    }
    break; // One snapshot per event is sufficient
  }
}

async function computePredictionAccuracies(
  state: PlaybackState,
  script: SimulationScript,
): Promise<PredictionAccuracyEntry[]> {
  const entries: PredictionAccuracyEntry[] = [];

  for (const agent of script.agents) {
    const participantId = state.participantIds.get(agent.name);
    if (!participantId) continue;

    try {
      const trackRecord = await state.engine.prediction.trackRecord(participantId);
      if (trackRecord.totalPredictions > 0) {
        entries.push({
          agentName: agent.name,
          forecastingAbility: agent.profile.forecastingAbility,
          averageAccuracy: trackRecord.averageAccuracy,
          predictionCount: trackRecord.totalPredictions,
        });
      }
    } catch {
      // Predictions may be disabled
    }
  }

  return entries;
}

function findNameById(state: PlaybackState, id: ParticipantId): string {
  for (const [name, pid] of state.participantIds) {
    if (pid === id) return name;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function resolveConfig(
  configOrPreset: GovernanceConfig | PresetName,
): GovernanceConfig {
  if (typeof configOrPreset === "string") {
    return getPreset(configOrPreset as PresetName);
  }
  return configOrPreset;
}
