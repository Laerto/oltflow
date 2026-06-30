"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type OltSummary } from "@/lib/api";

interface OltContextValue {
  olts: OltSummary[];
  currentOlt: OltSummary | null;
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
    refresh();
  }, [refresh]);

  const setCurrentOltId = useCallback((id: number) => {
    setCurrentOltIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const currentOlt = olts.find((o) => o.id === currentOltId) ?? null;

  return (
    <OltContext.Provider value={{ olts, currentOlt, setCurrentOltId, loading, refresh }}>
      {children}
    </OltContext.Provider>
  );
}

export function useOlts() {
  const ctx = useContext(OltContext);
  if (!ctx) throw new Error("useOlts must be used within OltProvider");
  return ctx;
}
