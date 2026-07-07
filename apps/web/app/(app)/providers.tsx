"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type OltSummary, type Me } from "@/lib/api";

/** Sentinel id for the "All OLTs" selection (aggregates every OLT in the ONU list). */
export const ALL_OLTS_ID = -1;

interface OltContextValue {
  olts: OltSummary[];
  currentOlt: OltSummary | null;
  /** True when "All OLTs" is selected — currentOlt is null in that case. */
  allOlts: boolean;
  setCurrentOltId: (id: number) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const OltContext = createContext<OltContextValue | null>(null);

const STORAGE_KEY = "oltflow_current_olt_id";

export function OltProvider({ children }: { children: ReactNode }) {
  const [olts, setOlts] = useState<OltSummary[]>([]);
  const [currentOltId, setCurrentOltIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { olts } = await api.listOlts();
      setOlts(olts);
      setCurrentOltIdState((prev) => {
        if (prev && olts.some((o) => o.id === prev)) return prev;
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        if (stored && olts.some((o) => o.id === stored)) return stored;
        return olts[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const setCurrentOltId = useCallback((id: number) => {
    setCurrentOltIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const currentOlt = olts.find((o) => o.id === currentOltId) ?? null;
  const allOlts = currentOltId === ALL_OLTS_ID;

  return (
    <OltContext.Provider value={{ olts, currentOlt, allOlts, setCurrentOltId, loading, refresh }}>
      {children}
    </OltContext.Provider>
  );
}

export function useOlts() {
  const ctx = useContext(OltContext);
  if (!ctx) throw new Error("useOlts must be used within OltProvider");
  return ctx;
}

// ── Current user / role ──────────────────────────────────────────────────────
const SessionContext = createContext<{ me: Me | null; loading: boolean }>({ me: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((m) => alive && setMe(m))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return <SessionContext.Provider value={{ me, loading }}>{children}</SessionContext.Provider>;
}

export function useMe(): Me | null {
  return useContext(SessionContext).me;
}
