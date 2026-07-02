"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Radio, Play, Square, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, pollJob, type OnuLiveResult } from "@/lib/api";

const POLL_MS = 8000;
const MAX_POINTS = 40;

// Best-effort vendor from the MAC OUI (first 3 bytes). Small curated map of what's common
// on this ISP; unknown prefixes just show the OUI so the office can still identify a device.
const OUI_VENDORS: Record<string, string> = {
  "4c5e0c": "MikroTik", "48a98a": "MikroTik", "6c3b6b": "MikroTik", "dc2c6e": "MikroTik",
  "2cc81b": "MikroTik", "cc2de0": "MikroTik", "e48d8c": "MikroTik", "b869f4": "MikroTik",
  "744d28": "MikroTik", "d4ca6d": "MikroTik", "64d154": "MikroTik", "18fd74": "MikroTik",
  "347839": "ZTE", "9ce1d6": "ZTE", "d0608c": "ZTE", "3478398d": "ZTE",
  "c83a35": "Tenda", "50c7bf": "TP-Link", "54af97": "TP-Link", "b0be76": "TP-Link",
  "f81a67": "TP-Link", "788a20": "Ubiquiti", "24a43c": "Ubiquiti", "fcecda": "Ubiquiti",
};

/** "3478.398d.3510" → "34:78:39:8d:35:10" */
function fmtMac(zte: string): string {
  const hex = zte.replace(/\./g, "");
  return hex.match(/.{1,2}/g)?.join(":") ?? zte;
}
function vendorOf(zte: string): string {
  const hex = zte.replace(/\./g, "").toLowerCase();
  return OUI_VENDORS[hex.slice(0, 6)] ?? `OUI ${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
}
function fmtBps(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${Math.round(bps)} bps`;
}
function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

interface Point {
  t: number;
  down: number; // Mbps
  up: number;
}

// PON status colour: fibre LOSS / offline = red, weak signal = amber, else green.
function ponStatus(state: string | null, onuRx: number | null, lastCause?: string): { color: string; label: string } {
  if (state !== "working") {
    const loss = (lastCause ?? "").toLowerCase().includes("los");
    return loss ? { color: "bg-rose-500", label: "LOSS (fibër)" } : { color: "bg-slate-400", label: "Offline" };
  }
  if (onuRx !== null && onuRx < -25) return { color: "bg-rose-500", label: "Kritik" };
  if (onuRx !== null && onuRx < -23) return { color: "bg-amber-500", label: "Warning" };
  return { color: "bg-emerald-500", label: "OK" };
}

export function OnuLivePanel({
  onuId,
  onuType,
  state,
  onuRx,
  lastCause,
}: {
  onuId: number;
  onuType: string | null;
  state: string | null;
  onuRx: number | null;
  lastCause?: string;
}) {
  const [running, setRunning] = useState(false);
  const [series, setSeries] = useState<Point[]>([]);
  const [snap, setSnap] = useState<OnuLiveResult | null>(null);
  const [rate, setRate] = useState<{ down: number; up: number }>({ down: 0, up: 0 });
  const [note, setNote] = useState<string | null>(null);
  const prev = useRef<{ up: number; down: number; t: number } | null>(null);
  const busyRef = useRef(false);

  const pon = ponStatus(state, onuRx, lastCause);
  const lanUp = state === "working" && ((snap?.macs.length ?? 0) > 0 || rate.down > 0 || rate.up > 0);

  const tick = useCallback(async () => {
    if (busyRef.current) return; // never overlap polls
    busyRef.current = true;
    try {
      const { jobId } = await api.onuLive(onuId);
      const job = await pollJob(jobId, { intervalMs: 1200, timeoutMs: 20000 });
      if (job.status !== "done") { setNote("OLT-ja s'u përgjigj — riprovohet"); return; }
      const out = job.output as OnuLiveResult | { busy: true };
      if ("busy" in out && out.busy) { setNote("OLT-ja e zënë — riprovohet"); return; }
      const live = out as OnuLiveResult;
      setNote(null);
      setSnap(live);
      const now = Date.now();
      if (prev.current) {
        const dt = (now - prev.current.t) / 1000;
        // Byte delta → bps; guard counter reset/wrap (ONU reboot) with a floor of 0.
        const up = Math.max(0, (live.totalUpBytes - prev.current.up) * 8) / dt;
        const down = Math.max(0, (live.totalDownBytes - prev.current.down) * 8) / dt;
        setRate({ down, up });
        setSeries((s) => [...s.slice(-(MAX_POINTS - 1)), { t: now, down: +(down / 1e6).toFixed(2), up: +(up / 1e6).toFixed(2) }]);
      }
      prev.current = { up: live.totalUpBytes, down: live.totalDownBytes, t: now };
    } catch {
      setNote("Gabim gjatë leximit live");
    } finally {
      busyRef.current = false;
    }
  }, [onuId]);

  useEffect(() => {
    if (!running) return;
    const first = setTimeout(() => void tick(), 0); // defer out of the effect body
    const iv = setInterval(() => void tick(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [running, tick]);

  function toggle() {
    if (running) {
      setRunning(false);
    } else {
      prev.current = null;
      setSeries([]);
      setRate({ down: 0, up: 0 });
      setRunning(true);
    }
  }

  return (
    <Card className="mt-4 py-4">
      <div className="mb-3 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Radio className={`h-4 w-4 ${running ? "animate-pulse text-rose-500" : "text-primary"}`} /> Pamje Live (ONU)
          {running && <span className="text-[11px] font-normal text-muted-foreground">rifreskim çdo {POLL_MS / 1000}s</span>}
        </div>
        <Button variant={running ? "destructive" : "default"} className="px-3 py-1 text-xs" onClick={toggle}>
          {running ? <><Square className="h-3.5 w-3.5" /> Ndalo</> : <><Play className="h-3.5 w-3.5" /> Nis Live</>}
        </Button>
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-[220px_1fr]">
        {/* Device visual */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-full rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-100 p-3 shadow-inner">
            <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{onuType || "ONU"}</div>
            <div className="flex items-end justify-center gap-1.5">
              {/* PON (fibre) */}
              <PortDot label="PON" color={pon.color} />
              <div className="mx-1 h-8 w-px bg-border" />
              {/* LAN ether1-4 */}
              {[1, 2, 3, 4].map((n) => (
                <PortDot key={n} label={`E${n}`} color={lanUp ? "bg-emerald-500/70" : "bg-slate-300"} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${pon.color}`} />
            <span className="text-muted-foreground">PON: {pon.label}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">Statusi per-LAN nuk raportohet nga OLT-ja (kërkon TR-069)</div>
        </div>

        {/* Traffic */}
        <div>
          <div className="mb-2 flex flex-wrap gap-4 text-sm">
            <span className="text-primary">↓ Download <b>{fmtBps(rate.down)}</b></span>
            <span className="text-emerald-600">↑ Upload <b>{fmtBps(rate.up)}</b></span>
            {snap && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                Total ↓{fmtBytes(snap.totalDownBytes)} · ↑{fmtBytes(snap.totalUpBytes)}
              </span>
            )}
          </div>
          <div className="h-[150px]">
            {series.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ld" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString("sq-AL", { minute: "2-digit", second: "2-digit" })} fontSize={10} stroke="var(--color-muted-foreground)" minTickGap={30} />
                  <YAxis fontSize={10} stroke="var(--color-muted-foreground)" unit="M" width={40} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} labelFormatter={(t) => new Date(t as number).toLocaleTimeString("sq-AL")} formatter={(v: number, n) => [`${v} Mbps`, n === "down" ? "Download" : "Upload"]} />
                  <Area type="monotone" dataKey="down" stroke="var(--color-primary)" strokeWidth={2} fill="url(#ld)" />
                  <Area type="monotone" dataKey="up" stroke="#10b981" strokeWidth={2} fill="url(#lu)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {note ?? "Duke mbledhur mostrat…"}</> : "Kliko “Nis Live” për trafikun në kohë reale"}
              </div>
            )}
          </div>
          {note && series.length > 0 && <div className="mt-1 text-[11px] text-amber-600">{note}</div>}
        </div>
      </div>

      {/* Connected devices */}
      <div className="mt-3 border-t border-border px-4 pt-3">
        <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
          Pajisjet e lidhura {snap && <span className="font-normal">({snap.macs.length})</span>}
        </div>
        {!snap ? (
          <div className="text-[11px] text-muted-foreground">Nis Live për të parë MAC-et pas ONU-së</div>
        ) : snap.macs.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">Asnjë MAC i mësuar</div>
        ) : (
          <div className="space-y-1">
            {snap.macs.map((m) => (
              <div key={m.mac} className="flex items-center gap-3 text-xs">
                <span className="font-mono text-foreground">{fmtMac(m.mac)}</span>
                {m.vlan && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600">VLAN {m.vlan}</span>}
                <span className="text-muted-foreground">{vendorOf(m.mac)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function PortDot({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-6 w-7 rounded-sm border border-slate-300 ${color}`} />
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}
