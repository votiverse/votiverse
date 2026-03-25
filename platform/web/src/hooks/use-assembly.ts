/**
 * Hook to fetch and cache assembly data (including governance config).
 *
 * Caches results in a module-level Map so multiple components on the same
 * page (nav tabs, bottom bar, page content) share one fetch per assembly.
 * Cache is invalidated when signal("assemblies") fires.
 */

import { useState, useEffect } from "react";
import type { Assembly } from "../api/types.js";
import * as api from "../api/client.js";
import { useSignal } from "./use-mutation-signal.js";

const cache = new Map<string, Assembly>();

interface UseAssemblyResult {
  assembly: Assembly | null;
  loading: boolean;
}

export function useAssembly(assemblyId: string | undefined): UseAssemblyResult {
  const [assembly, setAssembly] = useState<Assembly | null>(
    assemblyId ? cache.get(assemblyId) ?? null : null,
  );
  const [loading, setLoading] = useState(!assembly);
  const signalVersion = useSignal("assemblies");

  useEffect(() => {
    if (!assemblyId) return;

    // On signal invalidation, clear cache for this assembly to force refetch
    // (signalVersion changes mean something mutated)

    let cancelled = false;
    const cached = cache.get(assemblyId);
    if (cached && signalVersion === 0) {
      // Only use cache on first load (signalVersion === 0 means no mutations yet)
      setAssembly(cached);
      setLoading(false);
      return;
    }

    setLoading(!assembly);
    api.getAssembly(assemblyId)
      .then((data) => {
        if (!cancelled) {
          cache.set(assemblyId, data);
          setAssembly(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assemblyId, signalVersion]);

  return { assembly, loading };
}
