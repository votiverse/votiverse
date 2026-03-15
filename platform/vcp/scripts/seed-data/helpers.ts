/**
 * Seed helpers — API client and timing utilities.
 */

export const BASE_URL = process.env["VCP_URL"] ?? "http://localhost:3000";
export const API_KEY = process.env["VCP_API_KEY"] ?? "vcp_dev_key_00000000";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_KEY}`,
};

export async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** POST with X-Participant-Id header for authenticated participant actions. */
export async function postAs(path: string, body: unknown, participantId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { ...headers, "X-Participant-Id": participantId },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** DELETE with X-Participant-Id header. */
export async function deleteAs(path: string, participantId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: { ...headers, "X-Participant-Id": participantId },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DELETE ${path} failed (${res.status}): ${err}`);
  }
}

export async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// ── Timing constants ────────────────────────────────────────────────────

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/**
 * Returns an ISO string offset from now.
 * Positive offset = future, negative = past.
 */
export function fromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// ── ID registries (populated during seeding) ────────────────────────────

/** assemblyKey → assemblyId */
export const assemblyIds = new Map<string, string>();

/** (assemblyKey, participantName) → participantId */
export const participantIds = new Map<string, string>();

export function pKey(assemblyKey: string, name: string): string {
  return `${assemblyKey}::${name}`;
}

export function pid(assemblyKey: string, name: string): string {
  const id = participantIds.get(pKey(assemblyKey, name));
  if (!id) throw new Error(`Participant not found: ${name} in ${assemblyKey}`);
  return id;
}

export function aid(assemblyKey: string): string {
  const id = assemblyIds.get(assemblyKey);
  if (!id) throw new Error(`Assembly not found: ${assemblyKey}`);
  return id;
}

/** (assemblyKey, topicKey) → topicId */
export const topicIds = new Map<string, string>();

export function tKey(assemblyKey: string, topicKey: string): string {
  return `${assemblyKey}::${topicKey}`;
}

export function tid(assemblyKey: string, topicKey: string): string {
  const id = topicIds.get(tKey(assemblyKey, topicKey));
  if (!id) throw new Error(`Topic "${topicKey}" not found for assembly "${assemblyKey}"`);
  return id;
}

/** eventKey → { eventId, issueIds } */
export const eventRegistry = new Map<string, { eventId: string; issueIds: string[] }>();

export function eid(eventKey: string): string {
  const entry = eventRegistry.get(eventKey);
  if (!entry) throw new Error(`Event not found: ${eventKey}`);
  return entry.eventId;
}

export function iid(eventKey: string, issueIndex: number): string {
  const entry = eventRegistry.get(eventKey);
  if (!entry) throw new Error(`Event not found: ${eventKey}`);
  const id = entry.issueIds[issueIndex];
  if (!id) throw new Error(`Issue index ${issueIndex} not found in event ${eventKey}`);
  return id;
}
