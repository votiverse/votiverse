/**
 * Seed script — populates the VCP with rich, diverse sample data.
 *
 * Creates 4 organizations with 5 assemblies using different governance presets,
 * ~63 participants, 13 voting events (varied states), ~42 issues, delegations,
 * pre-cast votes, and polls.
 *
 * Usage: pnpm seed (with VCP server running on port 3000)
 */

import {
  post,
  postAs,
  get,
  fromNow,
  assemblyIds,
  participantIds,
  topicIds,
  pKey,
  tKey,
  pid,
  tid,
  aid,
  eventRegistry,
  iid,
  BASE_URL,
} from "./seed-data/helpers.js";
import { ASSEMBLIES } from "./seed-data/organizations.js";
import { PARTICIPANTS } from "./seed-data/participants.js";
import { TOPICS } from "./seed-data/topics.js";
import { EVENTS } from "./seed-data/events.js";
import { DELEGATIONS } from "./seed-data/delegations.js";
import { VOTES } from "./seed-data/votes.js";
import { POLLS, POLL_RESPONSES } from "./seed-data/polls.js";

export async function main() {
  console.log(`\nSeeding VCP at ${BASE_URL}...\n`);

  // ── Guard: abort if assemblies already exist ─────────────────────────
  const existing = await get("/assemblies") as { assemblies?: unknown[] };
  if (existing.assemblies && existing.assemblies.length > 0) {
    console.log(`  ⚠ Database already has ${existing.assemblies.length} assemblies — skipping seed.`);
    console.log("  Run 'pnpm reset' to wipe and reseed from scratch.\n");
    return;
  }

  // ── Step 1: Create assemblies ──────────────────────────────────────

  console.log("═══ ASSEMBLIES ═══\n");
  for (const def of ASSEMBLIES) {
    const assembly = await post("/assemblies", {
      name: def.name,
      organizationId: def.organizationId,
      preset: def.preset,
    });
    assemblyIds.set(def.key, assembly.id as string);
    console.log(`  ✓ ${def.name} (${def.preset}) → ${(assembly.id as string).slice(0, 8)}...`);
  }
  console.log(`\n  Created ${ASSEMBLIES.length} assemblies\n`);

  // ── Step 2: Add participants ───────────────────────────────────────

  console.log("═══ PARTICIPANTS ═══\n");
  let totalParticipants = 0;
  for (const [assemblyKey, names] of Object.entries(PARTICIPANTS)) {
    const assemblyId = aid(assemblyKey);
    for (const name of names) {
      const p = await post(`/assemblies/${assemblyId}/participants`, { name });
      participantIds.set(pKey(assemblyKey, name), p.id as string);
      totalParticipants++;
    }
    console.log(`  ✓ ${assemblyKey}: ${names.length} participants`);
  }
  console.log(`\n  Added ${totalParticipants} participants total\n`);

  // ── Step 3: Create topics ─────────────────────────────────────────

  console.log("═══ TOPICS ═══\n");
  const topicsByAssembly = new Map<string, number>();
  // First pass: create root topics (no parent)
  for (const def of TOPICS.filter((t) => t.parentKey === null)) {
    const assemblyId = aid(def.assemblyKey);
    const topic = await post(`/assemblies/${assemblyId}/topics`, {
      name: def.name,
      parentId: null,
      sortOrder: def.sortOrder,
    });
    topicIds.set(tKey(def.assemblyKey, def.key), topic.id as string);
    topicsByAssembly.set(def.assemblyKey, (topicsByAssembly.get(def.assemblyKey) ?? 0) + 1);
  }
  // Second pass: create child topics (have parent)
  for (const def of TOPICS.filter((t) => t.parentKey !== null)) {
    const assemblyId = aid(def.assemblyKey);
    const parentId = tid(def.assemblyKey, def.parentKey!);
    const topic = await post(`/assemblies/${assemblyId}/topics`, {
      name: def.name,
      parentId,
      sortOrder: def.sortOrder,
    });
    topicIds.set(tKey(def.assemblyKey, def.key), topic.id as string);
    topicsByAssembly.set(def.assemblyKey, (topicsByAssembly.get(def.assemblyKey) ?? 0) + 1);
  }
  for (const [key, count] of topicsByAssembly) {
    console.log(`  ✓ ${key}: ${count} topics`);
  }
  console.log(`\n  Created ${TOPICS.length} topics total\n`);

  // ── Step 4: Create voting events with issues ───────────────────────

  console.log("═══ VOTING EVENTS ═══\n");
  for (const def of EVENTS) {
    const assemblyId = aid(def.assemblyKey);
    const pNames = PARTICIPANTS[def.assemblyKey];
    if (!pNames) throw new Error(`No participants for assembly ${def.assemblyKey}`);

    const eligibleIds = pNames.map((n) => pid(def.assemblyKey, n));

    const event = await post(`/assemblies/${assemblyId}/events`, {
      title: def.title,
      description: def.description,
      issues: def.issues.map((i) => ({
        title: i.title,
        description: i.description,
        topicIds: (i.topicKeys ?? []).map((tk) => tid(def.assemblyKey, tk)),
        ...(i.choices ? { choices: i.choices } : {}),
      })),
      eligibleParticipantIds: eligibleIds,
      timeline: {
        deliberationStart: fromNow(def.deliberationStart),
        votingStart: fromNow(def.votingStart),
        votingEnd: fromNow(def.votingEnd),
      },
    });

    const issueIds = event.issueIds as string[];
    eventRegistry.set(def.key, { eventId: event.id as string, issueIds });

    const status =
      def.votingEnd < 0 ? "closed" :
      def.votingStart < 0 ? "voting" :
      def.deliberationStart < 0 ? "deliberation" : "upcoming";

    console.log(`  ✓ [${status.padEnd(13)}] ${def.title} (${def.issues.length} issues)`);
  }
  console.log(`\n  Created ${EVENTS.length} events\n`);

  // ── Step 5: Create delegations ─────────────────────────────────────

  console.log("═══ DELEGATIONS ═══\n");
  for (const def of DELEGATIONS) {
    const assemblyId = aid(def.assemblyKey);
    const sourceParticipantId = pid(def.assemblyKey, def.source);
    const resolvedScope = def.topicKeys
      ? def.topicKeys.map((tk) => tid(def.assemblyKey, tk))
      : def.topicScope;
    await postAs(`/assemblies/${assemblyId}/delegations`, {
      targetId: pid(def.assemblyKey, def.target),
      topicScope: resolvedScope,
    }, sourceParticipantId);
    const scopeLabel = resolvedScope.length > 0
      ? `(${def.topicKeys?.join(", ") ?? resolvedScope.length + " topics"})`
      : "(global)";
    console.log(`  ✓ ${def.source} → ${def.target} ${scopeLabel} (${def.assemblyKey})`);
  }
  console.log(`\n  Created ${DELEGATIONS.length} delegations\n`);

  // ── Step 6: Cast votes ─────────────────────────────────────────────

  console.log("═══ VOTES ═══\n");
  const votesByEvent = new Map<string, number>();
  for (const def of VOTES) {
    const assemblyId = aid(def.assemblyKey);
    const issueId = iid(def.eventKey, def.issueIndex);
    await post(`/assemblies/${assemblyId}/votes`, {
      participantId: pid(def.assemblyKey, def.participant),
      issueId,
      choice: def.choice,
    });
    votesByEvent.set(def.eventKey, (votesByEvent.get(def.eventKey) ?? 0) + 1);
  }
  for (const [eventKey, count] of votesByEvent) {
    console.log(`  ✓ ${eventKey}: ${count} votes`);
  }
  console.log(`\n  Cast ${VOTES.length} votes total\n`);

  // ── Step 7: Create polls and responses ─────────────────────────────

  console.log("═══ POLLS ═══\n");
  const pollIds = new Map<string, string>();
  const pollQuestionIds = new Map<string, string[]>();

  for (const def of POLLS) {
    const assemblyId = aid(def.assemblyKey);
    const creatorId = pid(def.assemblyKey, def.createdByName);

    const resolvedPollScope = def.topicKeys
      ? def.topicKeys.map((tk) => tid(def.assemblyKey, tk))
      : def.topicScope;
    const poll = await post(`/assemblies/${assemblyId}/polls`, {
      title: def.title,
      topicScope: resolvedPollScope,
      questions: def.questions,
      schedule: Date.now() + def.scheduleOffset,
      closesAt: Date.now() + def.closesAtOffset,
      createdBy: creatorId,
    });

    pollIds.set(def.key, poll.id as string);

    // Extract question IDs from response
    const questions = poll.questions as Array<{ id: string }>;
    pollQuestionIds.set(def.key, questions.map((q) => q.id));

    console.log(`  ✓ ${def.title} (${def.assemblyKey}, ${questions.length} questions)`);
  }

  // Submit poll responses
  let responseCount = 0;
  for (const def of POLL_RESPONSES) {
    const assemblyId = aid(def.assemblyKey);
    const pollId = pollIds.get(def.pollKey);
    const qIds = pollQuestionIds.get(def.pollKey);
    if (!pollId || !qIds) continue;

    const answers = def.answers.map((value, i) => ({
      questionId: qIds[i],
      value,
    }));

    await post(`/assemblies/${assemblyId}/polls/${pollId}/respond`, {
      pollId,
      participantId: pid(def.assemblyKey, def.participantName),
      answers,
    });
    responseCount++;
  }
  console.log(`\n  Created ${POLLS.length} polls with ${responseCount} responses\n`);

  // ── Summary ────────────────────────────────────────────────────────

  console.log("═══ SEED COMPLETE ═══\n");
  console.log("  Assemblies:    ", ASSEMBLIES.length);
  console.log("  Participants:  ", totalParticipants);
  console.log("  Topics:        ", TOPICS.length);
  console.log("  Events:        ", EVENTS.length);
  console.log("  Issues:        ", EVENTS.reduce((sum, e) => sum + e.issues.length, 0));
  console.log("  Delegations:   ", DELEGATIONS.length);
  console.log("  Votes:         ", VOTES.length);
  console.log("  Polls:         ", POLLS.length);
  console.log("  Poll Responses:", responseCount);
  console.log();

  // Cross-assembly participants for identity picker testing
  console.log("  Cross-assembly participants (pick any of these to test dashboard):");
  console.log("    Sofia Reyes   — OSC Governance Board, Youth Advisory Panel");
  console.log("    Marcus Chen   — OSC Governance Board, Municipal Budget Committee");
  console.log("    Priya Sharma  — Municipal Budget Committee, Youth Advisory Panel");
  console.log("    James Okafor  — Municipal Budget Committee, Board of Directors");
  console.log();
}

// Only self-execute when run directly (not when imported by reset.ts)
const isDirectRun = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
