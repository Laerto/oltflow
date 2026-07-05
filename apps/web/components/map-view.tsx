"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { MapOlt, MapOnu } from "@/lib/api";

// Signal-band → marker colour (matches the dashboard / signal-pill palette).
const BAND_COLOR: Record<string, string> = {
  good: "#10b981",
  warning: "#f59e0b",
  critical: "#ef4444",
  offline: "#94a3b8",
  unknown: "#64748b",
};

/** Leaflet network map: OLTs (blue, larger) + geolocated ONUs coloured by their latest
 * signal band. Leaflet is imported dynamically inside the effect so it never runs on the
 * server (it needs `window`). OSM tiles — the browser must have internet. */
export function MapView({ olts, onus }: { olts: MapOlt[]; onus: MapOnu[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const bounds: [number, number][] = [];

      for (const o of onus) {
        const color = BAND_COLOR[o.band] ?? BAND_COLOR.unknown;
        L.circleMarker([o.lat, o.lng], { radius: 5, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
          .bindPopup(
            `<b>${o.name ?? o.ponPort}</b><br>${o.ponPort}<br>Sinjal: ${o.onuRx ?? "–"} dBm <b style="color:${color}">${o.band}</b><br><a href="/onus/${o.id}">Hap ONU →</a>`
          )
          .addTo(map);
        bounds.push([o.lat, o.lng]);
      }

      for (const ol of olts) {
        L.circleMarker([ol.lat, ol.lng], { radius: 9, color: "#1e293b", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 })
          .bindPopup(`<b>OLT: ${ol.name}</b><br>${ol.location ?? ""}<br>Status: ${ol.status}`)
          .addTo(map);
        bounds.push([ol.lat, ol.lng]);
      }

      if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      else map.setView([41.15, 20.0], 7); // Albania fallback when nothing is geolocated yet
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [olts, onus]);

  return <div ref={containerRef} className="h-full w-full" />;
}
