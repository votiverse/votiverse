/**
 * Lightweight cross-component cache invalidation.
 *
 * When a mutation happens (group created, event created, etc.),
 * the mutating component calls `signal("groups")` or similar.
 * Components that depend on that data subscribe via `useSignal("groups")`
 * and re-fetch when the signal fires.
 *
 * This avoids Redux/Zustand while solving the stale-data-after-mutation
 * problem. It's a pub/sub pattern with React hooks.
 */

import { useSyncExternalStore, useCallback } from "react";

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
const versions = new Map<string, number>();

function getVersion(key: string): number {
  return versions.get(key) ?? 0;
}

/** Fire a signal to invalidate all subscribers of a given key. */
export function signal(key: string): void {
  versions.set(key, getVersion(key) + 1);
  const subs = listeners.get(key);
  if (subs) {
    for (const fn of subs) fn();
  }
}

/** Subscribe to a signal key. Returns the current version (changes trigger re-render). */
export function useSignal(key: string): number {
  const subscribe = useCallback((onStoreChange: Listener) => {
    let subs = listeners.get(key);
    if (!subs) {
      subs = new Set();
      listeners.set(key, subs);
    }
    subs.add(onStoreChange);
    return () => { subs!.delete(onStoreChange); };
  }, [key]);

  const getSnapshot = useCallback(() => getVersion(key), [key]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
