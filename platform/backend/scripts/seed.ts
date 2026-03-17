/**
 * Backend seed script — creates users and memberships from VCP data.
 *
 * Assumes VCP is running with seeded data at BACKEND_VCP_URL.
 * Assumes backend is running at BACKEND_URL.
 */

const VCP_URL = process.env["BACKEND_VCP_URL"] ?? "http://localhost:3000";
const VCP_API_KEY = process.env["BACKEND_VCP_API_KEY"] ?? "vcp_dev_key_00000000";
const BACKEND_URL = process.env["BACKEND_URL"] ?? "http://localhost:4000";

const DEFAULT_PASSWORD = "password";

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

  // 5. Sync tracked events and polls from VCP (pre-mark all as notified)
  // This prevents the scheduler from sending notifications about historical seeded data.
  let trackedEvents = 0;
  let trackedPolls = 0;

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

    // Sync polls
    try {
      const { polls } = await vcpGet<{ polls: Array<{ id: string; title: string; schedule: number; closesAt: number }> }>(
        `/assemblies/${assembly.id}/polls`,
      );
      for (const poll of polls) {
        await backendPost(
          "/internal/tracked-polls",
          {
            id: poll.id,
            assemblyId: assembly.id,
            title: poll.title,
            schedule: new Date(poll.schedule).toISOString(),
            closesAt: new Date(poll.closesAt).toISOString(),
          },
          firstToken,
        );
        trackedPolls++;
      }
    } catch {
      // Assembly may not have polls
    }
  }

  console.log(`\n═══ SEED COMPLETE ═══\n`);
  console.log(`  Users:            ${created}`);
  console.log(`  Cross-assembly:   ${crossAssembly}`);
  console.log(`  Cached assemblies:${cachedAssemblies}`);
  console.log(`  Tracked events:   ${trackedEvents}`);
  console.log(`  Tracked polls:    ${trackedPolls}`);
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
