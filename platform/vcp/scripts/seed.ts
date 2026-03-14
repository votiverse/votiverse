/**
 * Seed script — populates the VCP with sample data.
 *
 * Creates a sample Assembly with participants, topics, delegations,
 * voting events, and votes for immediate API exploration.
 */

const BASE_URL = process.env["VCP_URL"] ?? "http://localhost:3000";
const API_KEY = process.env["VCP_API_KEY"] ?? "vcp_dev_key_00000000";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_KEY}`,
};

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function main() {
  console.log(`Seeding VCP at ${BASE_URL}...\n`);

  // 1. Create Assembly with Liquid Standard preset
  const assembly = await post("/assemblies", {
    name: "Sample Organization Assembly",
    organizationId: "org-sample-001",
    preset: "LIQUID_STANDARD",
  });
  const assemblyId = assembly.id;
  console.log(`Created Assembly: ${assemblyId}`);
  console.log(`  Name: ${assembly.name}`);
  console.log(`  Preset: LIQUID_STANDARD\n`);

  // 2. Add 5 participants
  const participantNames = ["Alice", "Bob", "Carol", "Dave", "Eve"];
  const participants: Array<{ id: string; name: string }> = [];
  for (const name of participantNames) {
    const p = await post(`/assemblies/${assemblyId}/participants`, { name });
    participants.push(p);
    console.log(`Added participant: ${name} (${p.id})`);
  }
  console.log();

  // Convenience references
  const [alice, bob, carol, dave, eve] = participants;

  // 3. Create a voting event with 2 issues
  const now = Date.now();
  const votingEvent = await post(`/assemblies/${assemblyId}/events`, {
    title: "Q1 2026 Budget & Policy Review",
    description: "Quarterly review covering budget allocation and community guidelines.",
    issues: [
      {
        title: "Approve Q1 Budget Allocation",
        description: "Vote on the proposed budget allocation for Q1 2026. The proposal allocates 40% to operations, 30% to development, and 30% to community programs.",
        topicIds: [],
      },
      {
        title: "Update Community Guidelines",
        description: "Vote on proposed changes to community participation guidelines, including new mentorship requirements.",
        topicIds: [],
      },
    ],
    eligibleParticipantIds: participants.map((p) => p.id),
    timeline: {
      deliberationStart: new Date(now - 86400000).toISOString(), // started yesterday
      votingStart: new Date(now - 3600000).toISOString(), // voting started 1h ago
      votingEnd: new Date(now + 86400000 * 7).toISOString(), // closes in 7 days
    },
  });
  console.log(`Created Voting Event: ${votingEvent.id}`);
  console.log(`  Title: ${votingEvent.title}`);
  console.log(`  Issues: ${votingEvent.issues.map((i: { title: string }) => i.title).join(", ")}`);
  console.log();

  const issueIds = votingEvent.issueIds as string[];
  const [budgetIssueId, guidelinesIssueId] = issueIds;

  // 4. Create delegations
  // Alice delegates to Carol (general delegation)
  if (alice && carol) {
    const d1 = await post(`/assemblies/${assemblyId}/delegations`, {
      sourceId: alice.id,
      targetId: carol.id,
      topicScope: [],
    });
    console.log(`Delegation: Alice → Carol (general) [${d1.id}]`);
  }

  // Dave delegates to Bob (general delegation)
  if (dave && bob) {
    const d2 = await post(`/assemblies/${assemblyId}/delegations`, {
      sourceId: dave.id,
      targetId: bob.id,
      topicScope: [],
    });
    console.log(`Delegation: Dave → Bob (general) [${d2.id}]`);
  }
  console.log();

  // 5. Cast votes on the first issue (budget)
  if (bob && budgetIssueId) {
    await post(`/assemblies/${assemblyId}/votes`, {
      participantId: bob.id,
      issueId: budgetIssueId,
      choice: "for",
    });
    console.log(`Vote: Bob voted "for" on Budget (carries Dave's weight via delegation)`);
  }

  if (carol && budgetIssueId) {
    await post(`/assemblies/${assemblyId}/votes`, {
      participantId: carol.id,
      issueId: budgetIssueId,
      choice: "for",
    });
    console.log(`Vote: Carol voted "for" on Budget (carries Alice's weight via delegation)`);
  }

  if (eve && budgetIssueId) {
    await post(`/assemblies/${assemblyId}/votes`, {
      participantId: eve.id,
      issueId: budgetIssueId,
      choice: "against",
    });
    console.log(`Vote: Eve voted "against" on Budget`);
  }
  console.log();

  // 6. Summary
  console.log("=== Seed Complete ===");
  console.log();
  console.log("Try these API calls:");
  console.log();
  console.log(`  # Get assembly`);
  console.log(`  curl -H "Authorization: Bearer ${API_KEY}" ${BASE_URL}/assemblies/${assemblyId}`);
  console.log();
  console.log(`  # Get tally`);
  console.log(`  curl -H "Authorization: Bearer ${API_KEY}" ${BASE_URL}/assemblies/${assemblyId}/events/${votingEvent.id}/tally`);
  console.log();
  console.log(`  # List delegations`);
  console.log(`  curl -H "Authorization: Bearer ${API_KEY}" ${BASE_URL}/assemblies/${assemblyId}/delegations`);
  console.log();
  console.log(`  # List participants`);
  console.log(`  curl -H "Authorization: Bearer ${API_KEY}" ${BASE_URL}/assemblies/${assemblyId}/participants`);
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
