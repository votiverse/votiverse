/**
 * @votiverse/config — Configuration diffing
 *
 * Shows what a customized config changed from its base preset.
 */

import type { GovernanceConfig } from "./types.js";

/** A single difference between two configurations. */
export interface ConfigDiff {
  readonly path: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/**
 * Compares two governance configurations and returns the differences.
 *
 * @param base - The base configuration (e.g., a preset).
 * @param modified - The modified configuration.
 * @returns An array of differences. Empty array means the configs are identical.
 */
export function diffConfig(
  base: GovernanceConfig,
  modified: GovernanceConfig,
): readonly ConfigDiff[] {
  const diffs: ConfigDiff[] = [];
  diffObject(
    base as unknown as Readonly<Record<string, unknown>>,
    modified as unknown as Readonly<Record<string, unknown>>,
    "",
    diffs,
  );
  return diffs;
}

function diffObject(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
  prefix: string,
  diffs: ConfigDiff[],
): void {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const va = a[key];
    const vb = b[key];

    if (isPlainObject(va) && isPlainObject(vb)) {
      diffObject(
        va as Readonly<Record<string, unknown>>,
        vb as Readonly<Record<string, unknown>>,
        path,
        diffs,
      );
    } else if (!deepEqual(va, vb)) {
      diffs.push({ path, oldValue: va, newValue: vb });
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
