/**
 * @votiverse/cli — State management
 *
 * Manages engine state across CLI invocations using a JSON state file.
 * For Mode 1 (in-memory), state is ephemeral within a process.
 * For persistence across invocations, state is saved to .votiverse/state.json.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { InMemoryEventStore } from "@votiverse/core";
import type {
  EventId,
  IssueId,
  TopicId,
  VotingEventId,
  Timestamp,
  DomainEvent,
} from "@votiverse/core";
import { getPreset } from "@votiverse/config";
import type { GovernanceConfig, PresetName } from "@votiverse/config";
import { createEngine } from "@votiverse/engine";
import type { VotiverseEngine } from "@votiverse/engine";
import { InvitationProvider } from "@votiverse/identity";

const STATE_DIR = ".votiverse";
const STATE_FILE = "state.json";

interface PersistedIssue {
  id: string;
  title: string;
  description: string;
  topicIds: string[];
  votingEventId: string;
}

interface PersistedState {
  config: GovernanceConfig;
  events: SerializedEvent[];
  issues: PersistedIssue[];
}

interface SerializedEvent {
  id: string;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

/**
 * Initialize a new Votiverse instance with the given preset.
 * Creates the .votiverse directory and state file.
 */
export async function initState(presetName: PresetName): Promise<VotiverseEngine> {
  const config = getPreset(presetName);
  const stateDir = join(process.cwd(), STATE_DIR);
  if (!existsSync(stateDir)) {
    await mkdir(stateDir, { recursive: true });
  }

  const state: PersistedState = { config, events: [], issues: [] };
  await writeFile(join(stateDir, STATE_FILE), JSON.stringify(state, null, 2));

  const store = new InMemoryEventStore();
  const provider = new InvitationProvider(store);
  return createEngine({ config, eventStore: store, identityProvider: provider });
}

/**
 * Load the engine from the persisted state file.
 */
export async function loadState(): Promise<{
  engine: VotiverseEngine;
  store: InMemoryEventStore;
  provider: InvitationProvider;
}> {
  const statePath = join(process.cwd(), STATE_DIR, STATE_FILE);
  if (!existsSync(statePath)) {
    throw new Error("No Votiverse instance found. Run 'votiverse init' first.");
  }

  const raw = await readFile(statePath, "utf-8");
  const state: PersistedState = JSON.parse(raw) as PersistedState;

  const store = new InMemoryEventStore();

  // Replay events into the store
  for (const event of state.events) {
    await store.append({
      id: event.id as EventId,
      type: event.type,
      timestamp: event.timestamp as Timestamp,
      payload: event.payload,
    } as DomainEvent);
  }

  const provider = new InvitationProvider(store);
  // Rebuild provider's internal participant maps from the event store
  await provider.rehydrate();

  const engine = createEngine({
    config: state.config,
    eventStore: store,
    identityProvider: provider,
  });

  // Rebuild engine's internal maps (topics, voting events)
  await engine.rehydrate();

  // Restore issue data (stored separately from events)
  for (const issue of state.issues ?? []) {
    engine.injectIssue({
      id: issue.id as IssueId,
      title: issue.title,
      description: issue.description,
      topicIds: issue.topicIds as TopicId[],
      votingEventId: issue.votingEventId as VotingEventId,
    });
  }

  return { engine, store, provider };
}

/**
 * Save the current engine state to the state file.
 */
export async function saveState(engine: VotiverseEngine, store: InMemoryEventStore): Promise<void> {
  const stateDir = join(process.cwd(), STATE_DIR);
  const events = await store.getAll();
  const serialized: SerializedEvent[] = events.map((e) => ({
    id: e.id,
    type: e.type,
    timestamp: e.timestamp,
    payload: e.payload as Record<string, unknown>,
  }));

  const issues: PersistedIssue[] = engine.events.listIssues().map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    topicIds: [...i.topicIds],
    votingEventId: i.votingEventId,
  }));

  const config = engine.config.getCurrent();
  const state: PersistedState = { config, events: serialized, issues };
  await writeFile(join(stateDir, STATE_FILE), JSON.stringify(state, null, 2));
}
