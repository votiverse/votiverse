/**
 * Seed helpers — API client and timing utilities.
 */

export const BASE_URL = process.env["VCP_URL"] ?? "http://localhost:3000";
export const API_KEY = process.env["VCP_API_KEY"] ?? "vcp_dev_key_00000000";

/** Set the VCP dev clock to a specific epoch timestamp. */
export async function setDevClock(timeMs: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/dev/clock/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time: timeMs }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to set dev clock (${res.status}): ${err}. Is NODE_ENV=development set?`);
  }
}

/** Reset the VCP dev clock to system time. */
export async function resetDevClock(): Promise<void> {
  const res = await fetch(`${BASE_URL}/dev/clock/reset`, { method: "POST" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to reset dev clock (${res.status}): ${err}. Is NODE_ENV=development set?`);
  }
}

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

/** PUT with X-Participant-Id header for authenticated participant actions. */
export async function putAs(path: string, body: unknown, participantId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { ...headers, "X-Participant-Id": participantId },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PUT ${path} failed (${res.status}): ${err}`);
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

// ── Manifest persistence ─────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Manifest shape written to seed-manifest.json after seeding. */
export interface SeedManifest {
  /** ISO timestamp when the manifest was generated. */
  generatedAt: string;
  /** assemblyKey → assemblyId */
  assemblies: Record<string, string>;
  /** "assemblyKey::participantName" → participantId */
  participants: Record<string, string>;
  /** "assemblyKey::topicKey" → topicId */
  topics: Record<string, string>;
  /** eventKey → { eventId, issueIds } */
  events: Record<string, { eventId: string; issueIds: string[] }>;
}

/**
 * Write all in-memory registries to `platform/vcp/seed-manifest.json`.
 * Screenshot scripts and other tooling read this file instead of hardcoding UUIDs.
 */
export function writeManifest(): void {
  const manifest: SeedManifest = {
    generatedAt: new Date().toISOString(),
    assemblies: Object.fromEntries(assemblyIds),
    participants: Object.fromEntries(participantIds),
    topics: Object.fromEntries(topicIds),
    events: Object.fromEntries(eventRegistry),
  };

  // Write to platform/vcp/seed-manifest.json (two levels up from seed-data/)
  const manifestPath = join(import.meta.dirname ?? ".", "..", "..", "seed-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  📋 Manifest written → ${manifestPath}`);
}
