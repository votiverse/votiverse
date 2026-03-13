/**
 * @votiverse/simulate — Top-level runner
 *
 * Combines generation and playback into a single `runSimulation()` call.
 */

import type { VotiverseEngine } from "@votiverse/engine";
import type { SimulationScenario, SimulationScript, SimulationResults } from "./types.js";
import { generateScript } from "./generate.js";
import { playback } from "./playback.js";

/**
 * Result of a complete simulation run.
 */
export interface SimulationRunResult {
  /** The generated action script (serializable for replay). */
  readonly script: SimulationScript;
  /** Metrics extracted from the engine after playback. */
  readonly results: SimulationResults;
  /** The engine instance (for further querying if needed). */
  readonly engine: VotiverseEngine;
}

/**
 * Runs a complete simulation: generate script → play back through engine → extract metrics.
 */
export async function runSimulation(scenario: SimulationScenario): Promise<SimulationRunResult> {
  // Phase 1: Generate the deterministic action script
  const script = generateScript(scenario);

  // Phase 2: Play back through the real engine
  const { engine, results } = await playback(script);

  return { script, results, engine };
}
