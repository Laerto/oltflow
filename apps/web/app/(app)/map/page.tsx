"use client";

import { useCallback, useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { api, type MapOlt, type MapOnu, type MapSplitter, type MapFiber } from "@/lib/api";
import { useMe } from "@/app/(app)/providers";
import { can } from "@/lib/permissions";
import { MapView } from "@/components/map-view";

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={line ? "inline-block h-0.5 w-4 rounded" : "inline-block h-2.5 w-2.5 rounded-full"}
        style={{ background: color }}
      />{" "}
      {label}
    </span>
  );
}

export default function MapPage() {
  const me = useMe();
  const canEdit = can.operate(me?.role);
  const [olts, setOlts] = useState<MapOlt[]>([]);
  const [onus, setOnus] = useState<MapOnu[]>([]);
  const [splitters, setSplitters] = useState<MapSplitter[]>([]);
  const [fiber, setFiber] = useState<MapFiber[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api
      .mapData()
      .then((d) => { setOlts(d.olts); setOnus(d.onus); setSplitters(d.splitters); setFiber(d.fiber); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const empty = !loading && olts.length === 0 && onus.length === 0 && splitters.length === 0 && fiber.length === 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <MapIcon className="h-5 w-5 text-primary" /> Harta e rrjetit
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {olts.length} OLT · {splitters.length} splitter · {fiber.length} fibra · {onus.length} ONU
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Legend color="#3b82f6" label="OLT" />
          <Legend color="#7c3aed" label="Splitter" />
          <Legend color="#10b981" label="Good" />
          <Legend color="#f59e0b" label="Warning" />
          <Legend color="#ef4444" label="Critical" />
          <Legend color="#7c3aed" label="Backbone" line />
          <Legend color="#2563eb" label="Shpërndarje" line />
          <Legend color="#0ea5e9" label="Drop" line />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Duke ngarkuar hartën…</div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            <MapIcon className="mb-1 h-8 w-8 opacity-40" />
            Harta është bosh.
            <span className="text-xs">
              Vendos koordinata te OLT-t (Modifiko OLT) / ONU (📍), ose {canEdit ? "përdor mjetet ▣ Splitter / ／ Fibër për të ndërtuar ODN-në." : "kërko një operator të shtojë splitter/fibra."}
            </span>
          </div>
        ) : (
          <MapView olts={olts} onus={onus} splitters={splitters} fiber={fiber} canEdit={canEdit} onChanged={load} />
        )}
      </div>
    </div>
  );
}
