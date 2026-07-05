"use client";

import { useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { api, type MapOlt, type MapOnu } from "@/lib/api";
import { MapView } from "@/components/map-view";

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

export default function MapPage() {
  const [olts, setOlts] = useState<MapOlt[]>([]);
  const [onus, setOnus] = useState<MapOnu[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .mapData()
      .then((d) => { setOlts(d.olts); setOnus(d.onus); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const empty = !loading && olts.length === 0 && onus.length === 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <MapIcon className="h-5 w-5 text-primary" /> Harta e rrjetit
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{olts.length} OLT · {onus.length} ONU të gjeolokalizuara</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Legend color="#3b82f6" label="OLT" />
          <Legend color="#10b981" label="Good" />
          <Legend color="#f59e0b" label="Warning" />
          <Legend color="#ef4444" label="Critical" />
          <Legend color="#94a3b8" label="Offline" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Duke ngarkuar hartën…</div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            <MapIcon className="mb-1 h-8 w-8 opacity-40" />
            Asnjë pajisje me koordinata ende.
            <span className="text-xs">Vendos vendndodhjen te <b>Modifiko OLT</b> ose te faqja e një ONU-je (butoni 📍).</span>
          </div>
        ) : (
          <MapView olts={olts} onus={onus} />
        )}
      </div>
    </div>
  );
}
