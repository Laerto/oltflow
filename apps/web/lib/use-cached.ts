"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Tiny stale-while-revalidate cache (no external dep). A module-level Map keeps the last successful
// value per key for the session, so re-mounting a component (e.g. switching OLT) shows the cached
// data INSTANTLY instead of a skeleton, while a fresh fetch runs in the background and updates it.
// This is what makes the panel feel instant like SmartOLT (which serves cached state on load).
const cache = new Map<string, unknown>();

/** Prime/replace a cache entry from outside a component (e.g. after a mutation). */
export function primeCache<T>(key: string, value: T): void {
  cache.set(key, value);
}

export function useCached<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts?: { refreshMs?: number },
): { data: T | undefined; loading: boolean; revalidate: () => Promise<void> } {
  // Seed synchronously from the cache so the first render already has data (no skeleton flash).
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [loading, setLoading] = useState<boolean>(() => !(key !== null && cache.has(key)));

  // Keep the latest fetcher without making it a dependency (callers pass a fresh closure each render).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(async () => {
    if (key === null) return;
    try {
      const fresh = await fetcherRef.current();
      cache.set(key, fresh);
      setData(fresh);
    } catch {
      /* keep the stale value on error — better than blanking the panel */
    } finally {
      setLoading(false);
    }
  }, [key]);

  const refreshMs = opts?.refreshMs;
  useEffect(() => {
    if (key === null) return;
    // On (re)mount with a key: show cache immediately, then revalidate in the background.
    if (cache.has(key)) {
      setData(cache.get(key) as T);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void revalidate();
    if (refreshMs) {
      const id = setInterval(() => void revalidate(), refreshMs);
      return () => clearInterval(id);
    }
  }, [key, revalidate, refreshMs]);

  return { data, loading, revalidate };
}
