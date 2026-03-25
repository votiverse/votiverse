import { useState, useEffect, useCallback, useRef } from "react";
import { useSignal } from "./use-mutation-signal.js";

interface UseApiResult<T> {
  data: T | null;
  /** True only on initial load (no data yet). False during background refetches. */
  loading: boolean;
  /** True while a background refetch is in progress (data is stale but still displayed). */
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch data from the API with automatic refetching on dependency changes.
 *
 * @param fetcher — async function that returns data
 * @param deps — dependency array (refetch when these change)
 * @param signalKey — optional mutation signal key; when signal(key) is called
 *                     anywhere in the app, this hook automatically refetches
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = [], signalKey?: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const hasData = useRef(false);

  // Subscribe to mutation signals — version changes trigger refetch
  const signalVersion = useSignal(signalKey ?? "");

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    // First load: show spinner. Subsequent refetches: keep old data visible.
    if (hasData.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          hasData.current = true;
          setLoading(false);
          setRefreshing(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, signalVersion, ...deps]);

  return { data, loading, refreshing, error, refetch };
}
