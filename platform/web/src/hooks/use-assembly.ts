/**
 * Hook to fetch and cache assembly data (including governance config).
 *
 * Caches results in a module-level Map so multiple components on the same
 * page (nav tabs, bottom bar, page content) share one fetch per assembly.
 */

import { useState, useEffect } from "react";
import type { Assembly } from "../api/types.js";
import * as api from "../api/client.js";

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

  useEffect(() => {
    if (!assemblyId) return;

    const cached = cache.get(assemblyId);
    if (cached) {
      setAssembly(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
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
  }, [assemblyId]);

  return { assembly, loading };
}
