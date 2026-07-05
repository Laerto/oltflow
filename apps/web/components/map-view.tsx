"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup, LeafletMouseEvent } from "leaflet";
import { api, type MapOlt, type MapOnu, type MapSplitter, type MapFiber } from "@/lib/api";
import { FIBER_KIND_LABELS, FIBER_KINDS, SPLITTER_RATIOS } from "@oltflow/core";

type Leaflet = typeof import("leaflet");

const BAND_COLOR: Record<string, string> = {
  good: "#10b981",
  warning: "#f59e0b",
  critical: "#ef4444",
  offline: "#94a3b8",
  unknown: "#64748b",
};
const FIBER_COLOR: Record<string, string> = { backbone: "#7c3aed", distribution: "#2563eb", drop: "#0ea5e9" };
const FIBER_WEIGHT: Record<string, number> = { backbone: 5, distribution: 3, drop: 2 };

type Mode = "view" | "splitter" | "fiber";

export function MapView({
  olts,
  onus,
  splitters,
  fiber,
  canEdit,
  onChanged,
}: {
  olts: MapOlt[];
  onus: MapOnu[];
  splitters: MapSplitter[];
  fiber: MapFiber[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const LRef = useRef<Leaflet | null>(null);
  const dataLayerRef = useRef<LayerGroup | null>(null);
  const draftLayerRef = useRef<LayerGroup | null>(null);
  const fittedRef = useRef(false);

  const modeRef = useRef<Mode>("view");
  const ratioRef = useRef<string>("1:8");
  const kindRef = useRef<string>("distribution");
  const pointsRef = useRef<[number, number][]>([]);

  const [mode, setMode] = useState<Mode>("view");
  const [ratio, setRatio] = useState("1:8");
  const [kind, setKind] = useState("distribution");
  const [pointCount, setPointCount] = useState(0);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { ratioRef.current = ratio; }, [ratio]);
  useEffect(() => { kindRef.current = kind; }, [kind]);

  function clearDraft() {
    pointsRef.current = [];
    setPointCount(0);
    draftLayerRef.current?.clearLayers();
  }

  function redrawDraft() {
    const L = LRef.current;
    const layer = draftLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    const pts = pointsRef.current;
    if (pts.length >= 2) L.polyline(pts, { color: FIBER_COLOR[kindRef.current], weight: 3, dashArray: "6 6" }).addTo(layer);
    for (const p of pts) L.circleMarker(p, { radius: 4, color: "#111", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(layer);
  }

  async function finishFiber() {
    const path = pointsRef.current.slice();
    if (path.length < 2) { clearDraft(); setMode("view"); return; }
    try {
      await api.createFiber({ kind: kindRef.current, path });
      clearDraft();
      setMode("view");
      onChanged();
    } catch { /* keep draft so the user can retry */ }
  }

  async function onMapClick(e: LeafletMouseEvent) {
    if (modeRef.current === "splitter") {
      const name = window.prompt("Emri i splitterit:", "Splitter");
      if (!name) return;
      try {
        await api.createSplitter({ name: name.trim(), ratio: ratioRef.current, latitude: e.latlng.lat, longitude: e.latlng.lng });
        setMode("view");
        onChanged();
      } catch { /* ignore */ }
    } else if (modeRef.current === "fiber") {
      pointsRef.current.push([e.latlng.lat, e.latlng.lng]);
      setPointCount(pointsRef.current.length);
      redrawDraft();
    }
  }

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default as unknown as Leaflet;
      LRef.current = L;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      dataLayerRef.current = L.layerGroup().addTo(map);
      draftLayerRef.current = L.layerGroup().addTo(map);
      map.setView([41.15, 20.0], 8);
      map.on("click", onMapClick);
      // Delegated delete buttons rendered inside popups.
      containerRef.current.addEventListener("click", async (ev) => {
        const el = ev.target as HTMLElement;
        const ds = el.closest("[data-del-splitter]");
        if (ds) { await api.deleteSplitter(Number(ds.getAttribute("data-del-splitter"))); onChanged(); return; }
        const df = el.closest("[data-del-fiber]");
        if (df) { await api.deleteFiber(Number(df.getAttribute("data-del-fiber"))); onChanged(); }
      });
      renderData();
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers/lines whenever data changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { renderData(); }, [olts, onus, splitters, fiber, canEdit]);

  function renderData() {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = dataLayerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    for (const f of fiber) {
      const path = f.path as [number, number][];
      if (!Array.isArray(path) || path.length < 2) continue;
      L.polyline(path, { color: FIBER_COLOR[f.kind] ?? "#2563eb", weight: FIBER_WEIGHT[f.kind] ?? 3, opacity: 0.85 })
        .bindPopup(
          `<b>${f.name ?? FIBER_KIND_LABELS[f.kind as keyof typeof FIBER_KIND_LABELS] ?? f.kind}</b><br>${FIBER_KIND_LABELS[f.kind as keyof typeof FIBER_KIND_LABELS] ?? f.kind}${f.lengthM ? ` · ${f.lengthM} m` : ""}${canEdit ? `<br><button data-del-fiber="${f.id}" style="color:#ef4444">Fshi fibrën</button>` : ""}`
        )
        .addTo(layer);
      for (const p of path) bounds.push(p);
    }

    for (const o of onus) {
      const color = BAND_COLOR[o.band] ?? BAND_COLOR.unknown;
      L.circleMarker([o.lat, o.lng], { radius: 5, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
        .bindPopup(`<b>${o.name ?? o.ponPort}</b><br>${o.ponPort}<br>Sinjal: ${o.onuRx ?? "–"} dBm <b style="color:${color}">${o.band}</b><br><a href="/onus/${o.id}">Hap ONU →</a>`)
        .addTo(layer);
      bounds.push([o.lat, o.lng]);
    }

    for (const s of splitters) {
      const cap = Number(s.ratio.split(":")[1]) || 0;
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#7c3aed;color:#fff;border:2px solid #fff;border-radius:4px;padding:1px 4px;font:600 10px sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4)">${s.ratio}</div>`,
        iconSize: [34, 16],
        iconAnchor: [17, 8],
      });
      L.marker([s.lat, s.lng], { icon })
        .bindPopup(`<b>Splitter: ${s.name}</b><br>${s.ratio} · ${s.used}/${cap} të zëna${s.ponPort ? `<br>PON: ${s.ponPort}` : ""}${canEdit ? `<br><button data-del-splitter="${s.id}" style="color:#ef4444">Fshi splitterin</button>` : ""}`)
        .addTo(layer);
      bounds.push([s.lat, s.lng]);
    }

    for (const ol of olts) {
      L.circleMarker([ol.lat, ol.lng], { radius: 9, color: "#1e293b", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 })
        .bindPopup(`<b>OLT: ${ol.name}</b><br>${ol.location ?? ""}<br>Status: ${ol.status}`)
        .addTo(layer);
      bounds.push([ol.lat, ol.lng]);
    }

    if (bounds.length && !fittedRef.current) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      fittedRef.current = true;
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {canEdit && (
        <div className="absolute left-2 top-2 z-[500] flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur">
          <button
            onClick={() => { clearDraft(); setMode(mode === "splitter" ? "view" : "splitter"); }}
            className={`rounded-md px-2 py-1 text-xs font-medium ${mode === "splitter" ? "bg-violet-600 text-white" : "bg-muted text-foreground hover:bg-muted/70"}`}
          >
            ▣ Splitter
          </button>
          <button
            onClick={() => { clearDraft(); setMode(mode === "fiber" ? "view" : "fiber"); }}
            className={`rounded-md px-2 py-1 text-xs font-medium ${mode === "fiber" ? "bg-blue-600 text-white" : "bg-muted text-foreground hover:bg-muted/70"}`}
          >
            ／ Fibër
          </button>
          {mode === "splitter" && (
            <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="rounded-md border border-border bg-card px-1.5 py-1 text-xs">
              {SPLITTER_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {mode === "fiber" && (
            <>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border border-border bg-card px-1.5 py-1 text-xs">
                {FIBER_KINDS.map((k) => <option key={k} value={k}>{FIBER_KIND_LABELS[k]}</option>)}
              </select>
              <button onClick={finishFiber} disabled={pointCount < 2} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40">
                Përfundo ({pointCount})
              </button>
            </>
          )}
          {mode !== "view" && (
            <span className="px-1 text-[11px] text-muted-foreground">
              {mode === "splitter" ? "kliko hartën për të vendosur" : "kliko pikat, pastaj Përfundo"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
