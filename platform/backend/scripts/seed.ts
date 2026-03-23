/**
 * Backend seed script — creates users and memberships from VCP data.
 *
 * Assumes VCP is running with seeded data at BACKEND_VCP_URL.
 * Assumes backend is running at BACKEND_URL.
 */

const VCP_URL = process.env["BACKEND_VCP_URL"] ?? "http://localhost:3000";
const VCP_API_KEY = process.env["BACKEND_VCP_API_KEY"] ?? "vcp_dev_key_00000000";
const BACKEND_URL = process.env["BACKEND_URL"] ?? "http://localhost:4000";

const DEFAULT_PASSWORD = "password1234";

// ---------------------------------------------------------------------------
// Avatar generation — gender-appropriate DiceBear URLs
// Mirrors PARTICIPANT_GENDER from platform/vcp/scripts/seed-data/participants.ts
// ---------------------------------------------------------------------------

const FEMALE_NAMES = new Set([
  "Elena Vasquez", "Amara Johnson", "Claire Dubois", "Fatima Al-Hassan",
  "Linda Muller", "Yuki Nakamura", "Ingrid Svensson", "Sofia Reyes",
  "Anika Patel", "Mei-Ling Wu", "Chiara Rossi", "Zara Ibrahim",
  "Rina Kurosawa", "Nadia Boutros", "Tanya Volkov", "Priya Sharma",
  "Carmen Delgado", "Nkechi Adeyemi", "Sunita Rao", "Hana Yokota",
  "Isabel Cruz", "Fiona MacLeod", "Ayesha Khan", "Gabriela Santos",
  "Aisha Moyo", "Chloe Beaumont", "Nina Kowalski", "Emilia Strand",
  "Victoria Harrington", "Catherine Zhao", "Margaret Ashworth",
  "Elizabeth Fairfax", "Diana Reyes", "Leah Chen", "Priya Nair",
  "Janet Kim", "Fatima Al-Rashid", "Nina Volkov",
]);

const DICEBEAR_BASE = "https://api.dicebear.com/9.x/avataaars/svg";

/** Generate a gender-appropriate DiceBear avatar URL. */
function makeAvatarUrl(name: string): string {
  const seed = encodeURIComponent(name);
  if (FEMALE_NAMES.has(name)) {
    return `${DICEBEAR_BASE}?seed=${seed}&facialHairProbability=0`;
  }
  return `${DICEBEAR_BASE}?seed=${seed}&facialHairProbability=33`;
}

interface VCPAssembly {
  id: string;
  name: string;
  organizationId?: string | null;
  config?: unknown;
  status?: string;
  createdAt?: string;
}

interface VCPParticipant {
  id: string;
  name: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function vcpGet<T>(path: string): Promise<T> {
  const res = await fetch(`${VCP_URL}${path}`, {
    headers: { Authorization: `Bearer ${VCP_API_KEY}` },
  });
  if (!res.ok) throw new Error(`VCP GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function backendPost<T>(path: string, body: unknown, token?: string): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json() as T;
  return { status: res.status, body: data };
}

async function backendPut<T>(path: string, body: unknown, token: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T;
  return { status: res.status, body: data };
}

interface UserWithMemberships {
  slug: string;
  name: string;
  email: string;
  memberships: Array<{ assemblyId: string; assemblyName: string; participantId: string }>;
}

export async function main() {
  console.log(`\nSeeding backend from VCP at ${VCP_URL}...\n`);

  // 1. Fetch all assemblies (with full details) and their participants from VCP
  const { assemblies: assemblyList } = await vcpGet<{ assemblies: VCPAssembly[] }>("/assemblies");
  console.log(`Found ${assemblyList.length} assemblies in VCP\n`);

  // Fetch full assembly details for caching
  const assemblies: VCPAssembly[] = [];
  for (const asm of assemblyList) {
    const full = await vcpGet<VCPAssembly>(`/assemblies/${asm.id}`);
    assemblies.push(full);
  }

  // 2. Build a map of unique people across assemblies
  const userMap = new Map<string, UserWithMemberships>();

  for (const assembly of assemblies) {
    const { participants } = await vcpGet<{ participants: VCPParticipant[] }>(
      `/assemblies/${assembly.id}/participants`,
    );

    for (const p of participants) {
      const slug = slugify(p.name);
      let user = userMap.get(slug);
      if (!user) {
        user = {
          slug,
          name: p.name,
          email: `${slug}@example.com`,
          memberships: [],
        };
        userMap.set(slug, user);
      }
      user.memberships.push({
        assemblyId: assembly.id,
        assemblyName: assembly.name,
        participantId: p.id,
      });
    }
  }

  console.log(`Found ${userMap.size} unique users across assemblies\n`);

  // 3. Register users in the backend and create memberships
  let created = 0;
  let crossAssembly = 0;
  let firstToken: string | undefined;

  for (const user of userMap.values()) {
    // Register
    const { status, body } = await backendPost<{ user: { id: string }; accessToken: string }>(
      "/auth/register",
      { email: user.email, password: DEFAULT_PASSWORD, name: user.name },
    );

    if (status !== 201) {
      console.error(`  ✗ Failed to register ${user.name}: ${JSON.stringify(body)}`);
      continue;
    }

    const userId = body.user.id;
    const token = body.accessToken;
    if (!firstToken) firstToken = token;

    // Set gender-appropriate avatar
    await backendPut("/me/profile", { avatarUrl: makeAvatarUrl(user.name) }, token);

    // Create membership records directly via backend DB
    // We use a special internal endpoint or direct DB access via the seed
    // For now, use the /me/assemblies/:id/join endpoint — but VCP participant already exists
    // Instead, we'll register memberships via a direct API call
    // Since participants already exist in VCP (from VCP seed), we need to create
    // the membership records without re-creating participants.
    // We'll add a seed-only endpoint for this.

    // For simplicity, POST to a seed-specific batch endpoint
    for (const m of user.memberships) {
      await backendPost(
        "/internal/memberships",
        { userId, assemblyId: m.assemblyId, participantId: m.participantId, assemblyName: m.assemblyName },
        token,
      );
    }

    created++;
    if (user.memberships.length > 1) crossAssembly++;
  }

  // 4. Populate assembly cache
  let cachedAssemblies = 0;
  for (const asm of assemblies) {
    await backendPost(
      "/internal/assemblies-cache",
      {
        id: asm.id,
        organizationId: asm.organizationId ?? null,
        name: asm.name,
        config: asm.config ?? {},
        status: asm.status ?? "active",
        createdAt: asm.createdAt ?? new Date().toISOString(),
      },
      firstToken,
    );
    cachedAssemblies++;
  }

  // 5. Populate topic cache
  let cachedTopics = 0;
  for (const asm of assemblies) {
    try {
      const { topics } = await vcpGet<{ topics: Array<{ id: string; name: string; parentId?: string | null; sortOrder?: number }> }>(
        `/assemblies/${asm.id}/topics`,
      );
      if (topics.length > 0) {
        await backendPost(
          "/internal/topics-cache",
          {
            topics: topics.map((t) => ({
              id: t.id,
              assemblyId: asm.id,
              name: t.name,
              parentId: t.parentId ?? null,
              sortOrder: t.sortOrder ?? 0,
            })),
          },
          firstToken,
        );
        cachedTopics += topics.length;
      }
    } catch {
      // Assembly may not have topics
    }
  }

  // 6. Populate survey cache
  let cachedSurveys = 0;
  for (const asm of assemblies) {
    try {
      const { surveys } = await vcpGet<{ surveys: Array<{ id: string; title: string; questions: unknown[]; topicIds: string[]; schedule: number; closesAt: number; createdBy: string }> }>(
        `/assemblies/${asm.id}/surveys`,
      );
      if (surveys.length > 0) {
        await backendPost(
          "/internal/surveys-cache",
          {
            surveys: surveys.map((s) => ({
              id: s.id,
              assemblyId: asm.id,
              title: s.title,
              questions: s.questions,
              topicIds: s.topicIds ?? [],
              schedule: s.schedule,
              closesAt: s.closesAt,
              createdBy: s.createdBy,
            })),
          },
          firstToken,
        );
        cachedSurveys += surveys.length;
      }
    } catch {
      // Assembly may not have surveys
    }
  }

  // 7. Sync tracked events and surveys from VCP (pre-mark all as notified)
  // This prevents the scheduler from sending notifications about historical seeded data.
  let trackedEvents = 0;
  let trackedSurveys = 0;

  for (const assembly of assemblies) {
    // Sync events
    try {
      const { events } = await vcpGet<{ events: Array<{ id: string; title: string; timeline: { votingStart: string; votingEnd: string } }> }>(
        `/assemblies/${assembly.id}/events`,
      );
      for (const event of events) {
        await backendPost(
          "/internal/tracked-events",
          {
            id: event.id,
            assemblyId: assembly.id,
            title: event.title,
            votingStart: event.timeline.votingStart,
            votingEnd: event.timeline.votingEnd,
          },
          firstToken,
        );
        trackedEvents++;
      }
    } catch {
      // Assembly may not have events
    }

    // Sync surveys
    try {
      const { surveys } = await vcpGet<{ surveys: Array<{ id: string; title: string; schedule: number; closesAt: number }> }>(
        `/assemblies/${assembly.id}/surveys`,
      );
      for (const survey of surveys) {
        await backendPost(
          "/internal/tracked-surveys",
          {
            id: survey.id,
            assemblyId: assembly.id,
            title: survey.title,
            schedule: new Date(survey.schedule).toISOString(),
            closesAt: new Date(survey.closesAt).toISOString(),
          },
          firstToken,
        );
        trackedSurveys++;
      }
    } catch {
      // Assembly may not have surveys
    }
  }

  // 8. Seed content — fetch proposals/candidacies/notes from VCP, store markdown in backend
  let contentItems = 0;
  try {
    const { PROPOSALS, CANDIDACIES, NOTES } = await import("../../vcp/scripts/seed-data/content.js");

    const items: Array<{ type: string; id: string; assemblyId: string; versionNumber?: number; markdown: string }> = [];

    for (const asm of assemblies) {
      // Proposals
      try {
        const { proposals } = await vcpGet<{ proposals: Array<{ id: string; title: string }> }>(`/assemblies/${asm.id}/proposals`);
        for (const prop of proposals) {
          const def = (PROPOSALS as Array<{ title: string; markdown: string }>).find((p) => p.title === prop.title);
          if (def) items.push({ type: "proposal", id: prop.id, assemblyId: asm.id, versionNumber: 1, markdown: def.markdown });
        }
      } catch { /* no proposals */ }

      // Candidacies
      try {
        const { candidacies } = await vcpGet<{ candidacies: Array<{ id: string; participantId: string }> }>(`/assemblies/${asm.id}/candidacies`);
        const { participants: asmP } = await vcpGet<{ participants: Array<{ id: string; name: string }> }>(`/assemblies/${asm.id}/participants`);
        const nameMap = new Map(asmP.map((p) => [p.id, p.name]));
        for (const cand of candidacies) {
          const name = nameMap.get(cand.participantId);
          const def = (CANDIDACIES as Array<{ participantName: string; markdown: string }>).find((c) => c.participantName === name);
          if (def) items.push({ type: "candidacy", id: cand.id, assemblyId: asm.id, versionNumber: 1, markdown: def.markdown });
        }
      } catch { /* no candidacies */ }

      // Notes
      try {
        const { notes } = await vcpGet<{ notes: Array<{ id: string }> }>(`/assemblies/${asm.id}/notes`);
        const nameToKey: Record<string, string> = {
          "Youth Advisory Panel": "youth",
          "OSC Governance Board": "osc",
          "Maple Heights Condo Board": "maple",
          "Municipal Budget Committee": "municipal",
          "Greenfield Community Council": "greenfield",
          "Board of Directors": "board",
        };
        const asmNotes = (NOTES as Array<{ assemblyKey: string; markdown: string }>).filter((n) => {
          return n.assemblyKey === (nameToKey[asm.name] ?? "");
        });
        for (let i = 0; i < notes.length && i < asmNotes.length; i++) {
          items.push({ type: "note", id: notes[i]!.id, assemblyId: asm.id, markdown: asmNotes[i]!.markdown });
        }
      } catch { /* no notes */ }
    }

    if (items.length > 0) {
      await backendPost("/internal/content-seed", { items }, firstToken);
      contentItems = items.length;
      console.log(`  Content: ${contentItems} items (proposals, candidacies, notes)`);
    }
  } catch (err) {
    console.log(`  (Content seeding skipped: ${err instanceof Error ? err.message : String(err)})`);
  }

  // 9. Seed booklet recommendation for osc-deps
  try {
    // Find the OSC assembly
    const oscAsm = assemblies.find((a) => a.name.toLowerCase().includes("governance board"));
    if (oscAsm) {
      // Find the osc-deps event
      const { events } = await vcpGet<{ events: Array<{ id: string; title: string }> }>(
        `/assemblies/${oscAsm.id}/events`,
      );
      const depsEvent = events.find((e) => e.title.includes("Dependency"));
      if (depsEvent) {
        // Get the event's first issue
        const fullEvent = await vcpGet<{ issues: Array<{ id: string }> }>(
          `/assemblies/${oscAsm.id}/events/${depsEvent.id}`,
        );
        const issueId = fullEvent.issues?.[0]?.id;
        if (issueId) {
          // Find Sofia Reyes's token (first OSC participant = event creator)
          const sofiaSlug = "sofia-reyes";
          const sofiaUser = userMap.get(sofiaSlug);
          if (sofiaUser) {
            // Login as Sofia to get her token
            const loginRes = await backendPost<{ accessToken: string }>(
              "/auth/login",
              { email: `${sofiaSlug}@example.com`, password: DEFAULT_PASSWORD },
            );
            if (loginRes.status === 200) {
              const markdown = `## Organizer Recommendation

After reviewing both proposals and community feedback, the governance committee recommends voting **For** mandatory license compatibility checks.

**Key considerations:**
- The evidence shows real incidents where transitive dependencies introduced incompatible licenses
- The upfront CI cost is minimal compared to retroactive compliance costs
- The "against" position raises valid concerns about friction, but a well-configured scanner with an exception process addresses this
- We recommend a 30-day grace period for existing dependencies to reach compliance

This recommendation does not bind your vote — consider both arguments carefully and vote your conscience.`;

              await backendPost(
                `/assemblies/${oscAsm.id}/events/${depsEvent.id}/issues/${issueId}/recommendation`,
                { markdown },
                loginRes.body.accessToken,
              );
              console.log(`  Recommendation: seeded for Dependency Policy Review`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.log(`  (Recommendation seeding skipped: ${err instanceof Error ? err.message : String(err)})`);
  }

  console.log(`\n═══ SEED COMPLETE ═══\n`);
  console.log(`  Users:            ${created}`);
  console.log(`  Cross-assembly:   ${crossAssembly}`);
  console.log(`  Cached assemblies:${cachedAssemblies}`);
  console.log(`  Cached topics:    ${cachedTopics}`);
  console.log(`  Cached surveys:   ${cachedSurveys}`);
  console.log(`  Tracked events:   ${trackedEvents}`);
  console.log(`  Tracked surveys:  ${trackedSurveys}`);
  console.log(`  Content items:    ${contentItems}`);
  console.log(`  Default password: ${DEFAULT_PASSWORD}`);
  console.log();
}

// Self-execute only when run directly (not imported by reset.ts)
const isDirectRun = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isDirectRun) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
