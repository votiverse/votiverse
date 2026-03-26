/**
 * Seed script — populates the VCP with rich, diverse sample data.
 *
 * Creates 4 organizations with 5 assemblies using different governance presets,
 * ~63 participants, 13 voting events (varied states), ~42 issues, delegations,
 * pre-cast votes, and surveys.
 *
 * Usage: pnpm seed (with VCP server running on port 3000)
 */

import { createHash } from "node:crypto";
import {
  post,
  postAs,
  putAs,
  get,
  fromNow,
  setDevClock,
  resetDevClock,
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
  writeManifest,
} from "./seed-data/helpers.js";
import { ASSEMBLIES } from "./seed-data/organizations.js";
import { PARTICIPANTS } from "./seed-data/participants.js";
import { TOPICS } from "./seed-data/topics.js";
import { EVENTS } from "./seed-data/events.js";
import { DELEGATIONS } from "./seed-data/delegations.js";
import { VOTES } from "./seed-data/votes.js";
import { SURVEYS, SURVEY_RESPONSES } from "./seed-data/surveys.js";
import { PROPOSALS, CANDIDACIES, NOTES, NOTE_EVALUATIONS, PROPOSAL_ENDORSEMENTS } from "./seed-data/content.js";

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

  // ── Step 2b: Grant owner roles to first participant per assembly ───

  // ── Step 2b: Grant owner roles to first participant per assembly ───
  // Uses the role management API — the first participant becomes owner+admin
  console.log("═══ ASSEMBLY ROLES ═══\n");
  for (const [assemblyKey, names] of Object.entries(PARTICIPANTS)) {
    const assemblyId = aid(assemblyKey);
    const ownerName = names[0]!;
    const ownerId = pid(assemblyKey, ownerName);
    // Bootstrap: grant role via direct API (operational scope can write roles directly)
    await post(`/assemblies/${assemblyId}/roles/bootstrap`, { participantId: ownerId });
    console.log(`  ✓ ${assemblyKey}: ${ownerName} → owner`);
  }
  console.log("");

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
    // Use first participant as event creator (for curation rights)
    const creatorPid = pid(def.assemblyKey, pNames[0]!);

    const event = await postAs(`/assemblies/${assemblyId}/events`, {
      title: def.title,
      description: def.description,
      issues: def.issues.map((i) => ({
        title: i.title,
        description: i.description,
        topicId: i.topicKey ? tid(def.assemblyKey, i.topicKey) : null,
        ...(i.choices ? { choices: i.choices } : {}),
      })),
      eligibleParticipantIds: eligibleIds,
      timeline: {
        deliberationStart: fromNow(def.deliberationStart),
        votingStart: fromNow(def.votingStart),
        votingEnd: fromNow(def.votingEnd),
      },
    }, creatorPid);

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
    const delegationBody: Record<string, unknown> = {
      targetId: pid(def.assemblyKey, def.target),
      topicScope: resolvedScope,
    };
    if (def.issueEventKey != null && def.issueIndex != null) {
      delegationBody.issueScope = iid(def.issueEventKey, def.issueIndex);
    }
    await postAs(`/assemblies/${assemblyId}/delegations`, delegationBody, sourceParticipantId);
    const scopeLabel = def.issueEventKey
      ? `(issue: ${def.issueEventKey}[${def.issueIndex}])`
      : resolvedScope.length > 0
        ? `(${def.topicKeys?.join(", ") ?? resolvedScope.length + " topics"})`
        : "(global)";
    console.log(`  ✓ ${def.source} → ${def.target} ${scopeLabel} (${def.assemblyKey})`);
  }
  console.log(`\n  Created ${DELEGATIONS.length} delegations\n`);

  // ── Step 6: Cast votes ─────────────────────────────────────────────
  // The engine enforces voting timeline windows, so we use the dev clock
  // to set the VCP's time to the midpoint of each event's voting window
  // before casting votes for that event.

  console.log("═══ VOTES ═══\n");

  // Group votes by event key
  const voteGroups = new Map<string, typeof VOTES>();
  for (const def of VOTES) {
    if (!voteGroups.has(def.eventKey)) voteGroups.set(def.eventKey, []);
    voteGroups.get(def.eventKey)!.push(def);
  }

  // Build event key → timeline lookup
  const eventTimelines = new Map(EVENTS.map((e) => [e.key, { votingStart: e.votingStart, votingEnd: e.votingEnd }]));
  const seedNow = Date.now();

  for (const [eventKey, votes] of voteGroups) {
    const timeline = eventTimelines.get(eventKey);
    if (timeline) {
      // Set clock to midpoint of voting window
      const midpoint = seedNow + (timeline.votingStart + timeline.votingEnd) / 2;
      await setDevClock(midpoint);
    }

    for (const def of votes) {
      const assemblyId = aid(def.assemblyKey);
      const issueId = iid(def.eventKey, def.issueIndex);
      const voterPid = pid(def.assemblyKey, def.participant);
      await postAs(`/assemblies/${assemblyId}/votes`, {
        issueId,
        choice: def.choice,
      }, voterPid);
    }
    console.log(`  ✓ ${eventKey}: ${votes.length} votes`);
  }

  // Reset clock to real time
  await resetDevClock();
  console.log(`\n  Cast ${VOTES.length} votes total\n`);

  // ── Step 7: Create surveys and responses ───────────────────────────

  console.log("═══ SURVEYS ═══\n");
  const surveyIds = new Map<string, string>();
  const surveyQuestionIds = new Map<string, string[]>();

  for (const def of SURVEYS) {
    const assemblyId = aid(def.assemblyKey);
    const creatorId = pid(def.assemblyKey, def.createdByName);

    const resolvedSurveyScope = def.topicKeys
      ? def.topicKeys.map((tk) => tid(def.assemblyKey, tk))
      : def.topicScope;
    const survey = await post(`/assemblies/${assemblyId}/surveys`, {
      title: def.title,
      topicScope: resolvedSurveyScope,
      questions: def.questions,
      schedule: Date.now() + def.scheduleOffset,
      closesAt: Date.now() + def.closesAtOffset,
      createdBy: creatorId,
    });

    surveyIds.set(def.key, survey.id as string);

    // Extract question IDs from response
    const questions = survey.questions as Array<{ id: string }>;
    surveyQuestionIds.set(def.key, questions.map((q) => q.id));

    console.log(`  ✓ ${def.title} (${def.assemblyKey}, ${questions.length} questions)`);
  }

  // Submit survey responses
  let responseCount = 0;
  for (const def of SURVEY_RESPONSES) {
    const assemblyId = aid(def.assemblyKey);
    const surveyId = surveyIds.get(def.surveyKey);
    const qIds = surveyQuestionIds.get(def.surveyKey);
    if (!surveyId || !qIds) continue;

    const answers = def.answers.map((value, i) => ({
      questionId: qIds[i],
      value,
    }));

    const responderPid = pid(def.assemblyKey, def.participantName);
    await postAs(`/assemblies/${assemblyId}/surveys/${surveyId}/respond`, {
      surveyId,
      answers,
    }, responderPid);
    responseCount++;
  }
  console.log(`\n  Created ${SURVEYS.length} surveys with ${responseCount} responses\n`);

  // ── Step 8: Submit proposals ──────────────────────────────────────
  // Proposals must be submitted during the deliberation phase.
  // We use the dev clock to set time to the deliberation midpoint.

  console.log("═══ PROPOSALS ═══\n");
  const proposalIds: string[] = [];
  const proposalTimelines = new Map(EVENTS.map((e) => [e.key, { deliberationStart: e.deliberationStart, votingStart: e.votingStart }]));

  for (const def of PROPOSALS) {
    const assemblyId = aid(def.assemblyKey);
    const timeline = proposalTimelines.get(def.eventKey);
    if (timeline) {
      // Set clock to midpoint of deliberation phase
      const midpoint = seedNow + (timeline.deliberationStart + timeline.votingStart) / 2;
      await setDevClock(midpoint);
    }

    const authorPid = pid(def.assemblyKey, def.authorName);
    const issueId = iid(def.eventKey, def.issueIndex);
    const contentHash = createHash("sha256").update(def.markdown + "\0").digest("hex");

    const proposal = await postAs(`/assemblies/${assemblyId}/proposals`, {
      issueId,
      choiceKey: def.choiceKey,
      title: def.title,
      contentHash,
    }, authorPid);

    proposalIds.push(proposal.id as string);
    console.log(`  ✓ "${def.title}" by ${def.authorName} (${def.assemblyKey})`);
  }
  await resetDevClock();
  console.log(`\n  Submitted ${PROPOSALS.length} proposals\n`);

  // ── Step 8b: Endorse proposals ─────────────────────────────────────
  // Endorsements must happen during the deliberation phase, so set the
  // dev clock to each proposal's event deliberation midpoint.

  console.log("═══ PROPOSAL ENDORSEMENTS ═══\n");
  for (const def of PROPOSAL_ENDORSEMENTS) {
    const assemblyId = aid(def.assemblyKey);
    const evaluatorPid = pid(def.assemblyKey, def.participantName);
    const propId = proposalIds[def.proposalRef]!;

    // Find the event for this proposal and set the clock to deliberation
    const proposalDef = PROPOSALS[def.proposalRef];
    if (proposalDef) {
      const timeline = proposalTimelines.get(proposalDef.eventKey);
      if (timeline) {
        const midpoint = seedNow + (timeline.deliberationStart + timeline.votingStart) / 2;
        await setDevClock(midpoint);
      }
    }

    await postAs(`/assemblies/${assemblyId}/proposals/${propId}/evaluate`, {
      evaluation: def.evaluation,
    }, evaluatorPid);
  }
  await resetDevClock();
  console.log(`  ✓ ${PROPOSAL_ENDORSEMENTS.length} endorsements/disputes recorded\n`);

  // ── Step 8c: Feature proposals for booklet ─────────────────────────
  // Feature the highest-endorsed "for" and "against" proposals on osc-deps

  console.log("═══ FEATURED PROPOSALS ═══\n");
  const oscDepsEvent = eventRegistry.get("osc-deps");
  if (oscDepsEvent) {
    const oscId = aid("osc");
    // Feature "License Checks Protect" (for, index 2)
    const forPropId = proposalIds[2];
    if (forPropId) {
      const creatorPid = pid("osc", PARTICIPANTS["osc"]![0]!);
      await postAs(`/assemblies/${oscId}/proposals/${forPropId}/feature`, {}, creatorPid);
      console.log(`  ✓ Featured "License Checks Protect the Project" (for)`);
    }
    // Feature "License Enforcement Slows Innovation" (against, index 3)
    const againstPropId = proposalIds[3];
    if (againstPropId) {
      const creatorPid = pid("osc", PARTICIPANTS["osc"]![0]!);
      await postAs(`/assemblies/${oscId}/proposals/${againstPropId}/feature`, {}, creatorPid);
      console.log(`  ✓ Featured "License Enforcement Slows Innovation" (against)`);
    }
  }
  console.log();

  // ── Step 9: Declare candidacies ─────────────────────────────────────

  console.log("═══ CANDIDACIES ═══\n");
  const candidacyIds: string[] = [];

  for (const def of CANDIDACIES) {
    const assemblyId = aid(def.assemblyKey);
    const participantPid = pid(def.assemblyKey, def.participantName);
    const resolvedScope = def.topicKeys.map((tk) => tid(def.assemblyKey, tk));
    const contentHash = createHash("sha256").update(def.markdown + "\0").digest("hex");

    const candidacy = await postAs(`/assemblies/${assemblyId}/candidacies`, {
      topicScope: resolvedScope,
      voteTransparencyOptIn: def.voteTransparencyOptIn,
      contentHash,
    }, participantPid);

    candidacyIds.push(candidacy.id as string);
    const scopeLabel = def.topicKeys.length > 0 ? def.topicKeys.join(", ") : "global";
    console.log(`  ✓ ${def.participantName} (${scopeLabel}) [${def.voteTransparencyOptIn ? "transparent" : "private"}]`);
  }
  console.log(`\n  Declared ${CANDIDACIES.length} candidacies\n`);

  // ── Step 10: Create community notes ─────────────────────────────────

  console.log("═══ COMMUNITY NOTES ═══\n");
  const noteIds: string[] = [];

  for (const def of NOTES) {
    const assemblyId = aid(def.assemblyKey);
    const authorPid = pid(def.assemblyKey, def.authorName);
    const contentHash = createHash("sha256").update(def.markdown + "\0").digest("hex");

    // Resolve target ID from proposal or candidacy arrays
    const targetId = def.targetType === "proposal"
      ? proposalIds[def.targetRef]!
      : candidacyIds[def.targetRef]!;

    const note = await postAs(`/assemblies/${assemblyId}/notes`, {
      contentHash,
      targetType: def.targetType,
      targetId,
    }, authorPid);

    noteIds.push(note.id as string);
    console.log(`  ✓ ${def.authorName} on ${def.targetType} → "${def.markdown.slice(0, 60)}..."`);
  }

  // Evaluate notes
  let evalCount = 0;
  for (const def of NOTE_EVALUATIONS) {
    const assemblyId = aid(def.assemblyKey);
    const evaluatorPid = pid(def.assemblyKey, def.participantName);
    const noteId = noteIds[def.noteRef]!;

    await postAs(`/assemblies/${assemblyId}/notes/${noteId}/evaluate`, {
      evaluation: def.evaluation,
    }, evaluatorPid);
    evalCount++;
  }
  console.log(`\n  Created ${NOTES.length} notes with ${evalCount} evaluations\n`);

  // ── Step 11: Endorse candidates ──────────────────────────────────────
  // Seed endorsements from non-candidate participants on candidacies.

  console.log("═══ ENDORSEMENTS ═══\n");
  let endorseCount = 0;

  // Youth assembly endorsements
  const youthId = aid("youth");
  const youthCandidacyIds = candidacyIds.filter((_, i) => CANDIDACIES[i]?.assemblyKey === "youth");
  const youthNonCandidates = ["Jin Park", "Chloe Beaumont", "Nina Kowalski", "Ravi Gupta", "Emilia Strand"];

  for (const cId of youthCandidacyIds) {
    // Each candidate gets 2-4 random endorsements and 0-1 disputes
    const shuffled = youthNonCandidates.sort(() => Math.random() - 0.5);
    const endorseN = 2 + Math.floor(Math.random() * 3); // 2-4
    for (let i = 0; i < Math.min(endorseN, shuffled.length); i++) {
      try {
        const pId = pid("youth", shuffled[i]!);
        await putAs(`/assemblies/${youthId}/endorsements`, {
          targetType: "candidacy", targetId: cId, value: "endorse",
        }, pId);
        endorseCount++;
      } catch { /* skip */ }
    }
    // Occasional dispute
    if (Math.random() > 0.6 && shuffled.length > endorseN) {
      try {
        const pId = pid("youth", shuffled[endorseN]!);
        await putAs(`/assemblies/${youthId}/endorsements`, {
          targetType: "candidacy", targetId: cId, value: "dispute",
        }, pId);
        endorseCount++;
      } catch { /* skip */ }
    }
  }

  // Maple assembly endorsements
  const mapleId = aid("maple");
  const mapleCandidacyIds = candidacyIds.filter((_, i) => CANDIDACIES[i]?.assemblyKey === "maple");
  const mapleNonCandidates = ["Elena Vasquez", "Kai Andersen", "Sofia Reyes"];

  for (const cId of mapleCandidacyIds) {
    const shuffled = mapleNonCandidates.sort(() => Math.random() - 0.5);
    const endorseN = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < Math.min(endorseN, shuffled.length); i++) {
      try {
        const pId = pid("maple", shuffled[i]!);
        await putAs(`/assemblies/${mapleId}/endorsements`, {
          targetType: "candidacy", targetId: cId, value: "endorse",
        }, pId);
        endorseCount++;
      } catch { /* skip */ }
    }
  }

  console.log(`  Endorsements: ${endorseCount}\n`);

  // ── Step 12: Cancel misclassified issues ────────────────────────────
  // The Riverside "Summer Camp Registration Fees" issue was classified
  // under Budget / Fees but should be Programs / Youth. Cancel it during
  // deliberation to demonstrate the correction workflow.

  console.log("═══ ISSUE CANCELLATIONS ═══\n");
  const riversideSummer = eventRegistry.get("riverside-summer");
  if (riversideSummer) {
    const riversideId = aid("riverside");
    const eventId = riversideSummer.eventId;
    const issueId = riversideSummer.issueIds[1]!; // Issue 1: "Summer Camp Registration Fees"
    const dianaId = pid("riverside", "Diana Reyes");

    await postAs(
      `/assemblies/${riversideId}/events/${eventId}/issues/${issueId}/cancel`,
      { reason: "Misclassified under Budget / Fees. This is a youth program design question, not a budget matter. Reclassified as Programs / Youth in a new event." },
      dianaId,
    );
    console.log(`  ✓ Cancelled "Summer Camp Registration Fees" (riverside-summer, issue 1)`);
    console.log(`    Reason: Reclassified from Budget / Fees → Programs / Youth`);
  }
  console.log();

  // ── Manifest ─────────────────────────────────────────────────────────
  // Write all key→UUID mappings so screenshot scripts and other tooling
  // can reference entities without hardcoding UUIDs.

  writeManifest();

  // ── Summary ────────────────────────────────────────────────────────

  console.log("\n═══ SEED COMPLETE ═══\n");
  console.log("  Assemblies:    ", ASSEMBLIES.length);
  console.log("  Participants:  ", totalParticipants);
  console.log("  Topics:        ", TOPICS.length);
  console.log("  Events:        ", EVENTS.length);
  console.log("  Issues:        ", EVENTS.reduce((sum, e) => sum + e.issues.length, 0));
  console.log("  Delegations:   ", DELEGATIONS.length);
  console.log("  Votes:         ", VOTES.length);
  console.log("  Surveys:       ", SURVEYS.length);
  console.log("  Survey Responses:", responseCount);
  console.log("  Proposals:     ", PROPOSALS.length);
  console.log("  Endorsements:  ", PROPOSAL_ENDORSEMENTS.length);
  console.log("  Candidacies:   ", CANDIDACIES.length);
  console.log("  Notes:         ", NOTES.length);
  console.log("  Evaluations:   ", evalCount);
  console.log();

  // Cross-assembly users for testing (login via backend with email: slug@example.com, password: password)
  console.log("  Cross-assembly participants (login via backend to test dashboard):");
  console.log("    Elena Vasquez — Greenfield Community Council, Maple Heights Condo Board");
  console.log("    Marcus Chen   — OSC Governance Board, Municipal Budget Committee, Maple Heights");
  console.log("    Sofia Reyes   — OSC Governance Board, Youth Advisory Panel, Maple Heights");
  console.log("    Thomas Wright — Greenfield Community Council, Maple Heights Condo Board");
  console.log("    Amara Johnson — Greenfield Community Council, Maple Heights Condo Board");
  console.log("    Kai Andersen  — OSC Governance Board, Maple Heights Condo Board");
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
