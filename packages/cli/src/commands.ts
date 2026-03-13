/**
 * @votiverse/cli — Command implementations
 *
 * Each command loads the engine state, performs the operation,
 * saves the state, and outputs the result.
 */

import type { PresetName } from "@votiverse/config";
import { getPresetNames, validateConfig, getPreset } from "@votiverse/config";
import { isOk } from "@votiverse/core";
import type { TopicId, IssueId, Timestamp } from "@votiverse/core";
import { timestamp } from "@votiverse/core";
import { initState, loadState, saveState } from "./state.js";
import type { Output } from "./output.js";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function cmdInit(presetName: string, out: Output): Promise<void> {
  const names = getPresetNames();
  if (!names.includes(presetName as PresetName)) {
    out.error(`Unknown preset: ${presetName}`);
    out.info(`Available presets: ${names.join(", ")}`);
    return;
  }

  await initState(presetName as PresetName);
  out.success(`Initialized Votiverse with preset "${presetName}"`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function cmdConfigPresets(out: Output): Promise<void> {
  const names = getPresetNames();
  for (const name of names) {
    const preset = getPreset(name);
    out.info(`${name}: ${preset.description}`);
  }
}

export async function cmdConfigShow(out: Output): Promise<void> {
  const { engine } = await loadState();
  const config = engine.config.getCurrent();
  out.json(config);
}

export async function cmdConfigValidate(out: Output): Promise<void> {
  const { engine } = await loadState();
  const config = engine.config.getCurrent();
  const result = validateConfig(config);
  if (result.valid) {
    out.success("Configuration is valid");
  } else {
    out.error("Configuration has errors:");
  }
  for (const issue of result.issues) {
    const prefix = issue.severity === "error" ? "ERROR" : "WARNING";
    out.info(`  [${prefix}] ${issue.field}: ${issue.message}`);
  }
}

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

export async function cmdParticipantAdd(name: string, out: Output): Promise<void> {
  const { engine, store, provider } = await loadState();
  const result = await provider.invite(name);
  if (isOk(result)) {
    await saveState(engine, store);
    out.success(`Added participant "${result.value.name}" (${result.value.id})`);
  } else {
    out.error(`Failed to add participant: ${result.error.message}`);
  }
}

export async function cmdParticipantList(out: Output): Promise<void> {
  const { provider } = await loadState();
  const participants = await provider.listParticipants();
  if (participants.length === 0) {
    out.info("No participants registered");
    return;
  }
  for (const p of participants) {
    out.info(`${p.name} (${p.id})`);
  }
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export async function cmdEventCreate(
  title: string,
  issueTitle: string,
  topicName: string | undefined,
  out: Output,
): Promise<void> {
  const { engine, store, provider } = await loadState();

  // Get or create topic
  let topicId: TopicId | undefined;
  if (topicName) {
    const existing = engine.topics_api
      .list()
      .find((t) => t.name.toLowerCase() === topicName.toLowerCase());
    if (existing) {
      topicId = existing.id;
    } else {
      const topic = await engine.topics_api.create(topicName);
      topicId = topic.id;
    }
  }

  // Get all participants as eligible
  const participants = await provider.listParticipants();
  if (participants.length === 0) {
    out.error("No participants registered. Add participants first.");
    return;
  }

  const now = Date.now();
  const votingEvent = await engine.events.create({
    title,
    description: title,
    issues: [
      {
        title: issueTitle,
        description: issueTitle,
        topicIds: topicId ? [topicId] : [],
      },
    ],
    eligibleParticipantIds: participants.map((p) => p.id),
    timeline: {
      deliberationStart: timestamp(now) as Timestamp,
      votingStart: timestamp(now) as Timestamp,
      votingEnd: timestamp(now + 7 * 86400000) as Timestamp,
    },
  });

  await saveState(engine, store);
  out.success(`Created voting event "${title}" (${votingEvent.id})`);
  out.info(`Issue: "${issueTitle}" (${votingEvent.issueIds[0]})`);
}

export async function cmdEventList(out: Output): Promise<void> {
  const { engine } = await loadState();
  const events = engine.events.list();
  if (events.length === 0) {
    out.info("No voting events");
    return;
  }
  for (const event of events) {
    out.info(`${event.id}: ${event.title} (${event.issueIds.length} issue(s))`);
  }
}

// ---------------------------------------------------------------------------
// Delegate
// ---------------------------------------------------------------------------

export async function cmdDelegateSet(
  sourceName: string,
  targetName: string,
  scope: string | undefined,
  out: Output,
): Promise<void> {
  const { engine, store, provider } = await loadState();
  const participants = await provider.listParticipants();

  const source = participants.find((p) => p.name.toLowerCase() === sourceName.toLowerCase());
  const target = participants.find((p) => p.name.toLowerCase() === targetName.toLowerCase());

  if (!source) {
    out.error(`Participant "${sourceName}" not found`);
    return;
  }
  if (!target) {
    out.error(`Participant "${targetName}" not found`);
    return;
  }

  const topicScope: TopicId[] = [];
  if (scope) {
    const topic = engine.topics_api
      .list()
      .find((t) => t.name.toLowerCase() === scope.toLowerCase());
    if (topic) {
      topicScope.push(topic.id);
    }
  }

  try {
    await engine.delegation.create({
      sourceId: source.id,
      targetId: target.id,
      topicScope,
    });
    await saveState(engine, store);
    out.success(`${source.name} now delegates to ${target.name}`);
  } catch (err) {
    out.error(`Failed: ${(err as Error).message}`);
  }
}

export async function cmdDelegateList(out: Output): Promise<void> {
  const { engine, provider } = await loadState();
  const delegations = await engine.delegation.listActive();
  const participants = await provider.listParticipants();
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));

  if (delegations.length === 0) {
    out.info("No active delegations");
    return;
  }
  for (const d of delegations) {
    const source = nameMap.get(d.sourceId) ?? d.sourceId;
    const target = nameMap.get(d.targetId) ?? d.targetId;
    out.info(`${source} → ${target}`);
  }
}

// ---------------------------------------------------------------------------
// Vote
// ---------------------------------------------------------------------------

export async function cmdVote(
  issueId: string,
  choice: string,
  participantName: string,
  out: Output,
): Promise<void> {
  const { engine, store, provider } = await loadState();
  const participants = await provider.listParticipants();
  const participant = participants.find(
    (p) => p.name.toLowerCase() === participantName.toLowerCase(),
  );

  if (!participant) {
    out.error(`Participant "${participantName}" not found`);
    return;
  }

  try {
    await engine.voting.cast(participant.id, issueId as IssueId, choice);
    await saveState(engine, store);
    out.success(`${participant.name} voted "${choice}" on issue ${issueId}`);
  } catch (err) {
    out.error(`Failed: ${(err as Error).message}`);
  }
}

export async function cmdVoteTally(issueId: string, out: Output): Promise<void> {
  const { engine } = await loadState();
  try {
    const result = await engine.voting.tally(issueId as IssueId);
    out.info(`Tally for issue ${issueId}:`);
    out.info(`  Winner: ${result.winner ?? "(no winner)"}`);
    out.info(`  Quorum met: ${result.quorumMet}`);
    out.info(`  Total votes: ${result.totalVotes}`);
    out.info("  Counts:");
    for (const [choice, count] of result.counts) {
      out.info(`    ${choice}: ${count}`);
    }
  } catch (err) {
    out.error(`Failed: ${(err as Error).message}`);
  }
}

export async function cmdVoteWeights(issueId: string, out: Output): Promise<void> {
  const { engine, provider } = await loadState();
  const participants = await provider.listParticipants();
  const nameMap = new Map(participants.map((p) => [p.id, p.name]));

  try {
    const dist = await engine.delegation.weights(issueId as IssueId);
    out.info(`Weight distribution for issue ${issueId}:`);
    out.info(`  Total weight: ${dist.totalWeight}`);
    for (const [pid, weight] of dist.weights) {
      if (weight > 0) {
        const name = nameMap.get(pid) ?? pid;
        out.info(`    ${name}: ${weight}`);
      }
    }
  } catch (err) {
    out.error(`Failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Events log
// ---------------------------------------------------------------------------

export async function cmdEventsLog(tail: number, out: Output): Promise<void> {
  const { store } = await loadState();
  const events = await store.getAll();
  const toShow = tail > 0 ? events.slice(-tail) : events;
  for (const event of toShow) {
    out.info(
      `[${new Date(event.timestamp).toISOString()}] ${event.type}: ${JSON.stringify(event.payload)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function cmdStatus(out: Output): Promise<void> {
  const { engine, store, provider } = await loadState();
  const config = engine.config.getCurrent();
  const events = await store.getAll();
  const participants = await provider.listParticipants();
  const votingEvents = engine.events.list();

  out.info(`Votiverse Instance Status`);
  out.info(`  Config: ${config.name}`);
  out.info(`  Participants: ${participants.length}`);
  out.info(`  Voting events: ${votingEvents.length}`);
  out.info(`  Total events in log: ${events.length}`);
}
