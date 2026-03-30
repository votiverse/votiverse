/**
 * Hook to fetch and cache group data (including governance config).
 *
 * Caches results in a module-level Map so multiple components on the same
 * page (nav tabs, bottom bar, page content) share one fetch per group.
 * Cache is invalidated when signal("groups") fires.
 */

import { useState, useEffect } from "react";
import type { Group } from "../api/types.js";
import { DEFAULT_CONFIG } from "../api/types.js";
import * as api from "../api/client.js";
import { useSignal } from "./use-mutation-signal.js";

const cache = new Map<string, Group>();

interface UseGroupResult {
  group: Group | null;
  loading: boolean;
}

export function useGroup(groupId: string | undefined): UseGroupResult {
  const [group, setGroup] = useState<Group | null>(
    groupId ? cache.get(groupId) ?? null : null,
  );
  const [loading, setLoading] = useState(!group);
  const signalVersion = useSignal("groups");

  useEffect(() => {
    if (!groupId) return;

    // On signal invalidation, clear cache for this group to force refetch
    // (signalVersion changes mean something mutated)

    let cancelled = false;
    const cached = cache.get(groupId);
    if (cached && signalVersion === 0) {
      // Only use cache on first load (signalVersion === 0 means no mutations yet)
      setGroup(cached);
      setLoading(false);
      return;
    }

    setLoading(!group);
    api.getGroup(groupId)
      .then((data) => {
        if (!cancelled) {
          // Ensure config is never null — apply defaults for non-voting groups
          if (!data.config) data.config = DEFAULT_CONFIG;
          cache.set(groupId, data);
          setGroup(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, signalVersion]);

  return { group, loading };
}
