"use client";

import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

interface Port {
  ponPort: string;
  downBps: number;
  upBps: number;
}
interface Point {
  t: number;
  downBps: number;
  upBps: number;
}

/** Human-readable bit rate. */
function fmtBps(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${Math.round(bps)} bps`;
}

const shortPort = (p: string) => p.replace(/^e?gpon_/i, "").replace(/^epon_/i, "");

export function PonTrafficCard({ oltId }: { oltId: number }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [ports, setPorts] = useState<Port[]>([]);
  const [series, setSeries] = useState<Point[]>([]);

  const refresh = useCallback(() => {
    api
      .ponTraffic(oltId)
      .then((r) => {
        setAvailable(r.available);
        setPorts(r.ports);
        setSeries(r.series);
      })
      .catch(() => setAvailable(false));
  }, [oltId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const totalDown = ports.reduce((s, p) => s + p.downBps, 0);
  const totalUp = ports.reduce((s, p) => s + p.upBps, 0);
  const maxPort = Math.max(1, ...ports.map((p) => p.downBps + p.upBps));
  const chartData = series.map((p) => ({
    t: p.t,
    down: +(p.downBps / 1e6).toFixed(2),
    up: +(p.upBps / 1e6).toFixed(2),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-primary" /> Bandwidth per-PON (SNMP)
          {available && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              ↓ {fmtBps(totalDown)} · ↑ {fmtBps(totalUp)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {available === false ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            SNMP jo i disponueshëm për këtë OLT — aktivizoje community-n read për grafikun e trafikut.
          </div>
        ) : available === null || (series.length === 0 && ports.length === 0) ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Duke mbledhur mostrat e trafikut…</div>
        ) : (
          <>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ponDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ponUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    tickFormatter={(t) => new Date(t).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit" })}
                    fontSize={10}
                    stroke="var(--color-muted-foreground)"
                    minTickGap={40}
                  />
                  <YAxis fontSize={10} stroke="var(--color-muted-foreground)" unit="M" width={44} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    labelFormatter={(t) => new Date(t as number).toLocaleTimeString("sq-AL")}
                    formatter={(v: number, name) => [`${v} Mbps`, name === "down" ? "Download" : "Upload"]}
                  />
                  <Area type="monotone" dataKey="down" stroke="var(--color-primary)" strokeWidth={2} fill="url(#ponDown)" />
                  <Area type="monotone" dataKey="up" stroke="#10b981" strokeWidth={2} fill="url(#ponUp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 max-h-[150px] space-y-1.5 overflow-y-auto">
              {ports.map((p) => (
                <div key={p.ponPort} className="flex items-center gap-2 text-xs">
                  <span className="w-16 flex-shrink-0 font-mono text-[11px] text-muted-foreground">{shortPort(p.ponPort)}</span>
                  <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="bg-primary" style={{ width: `${(p.downBps / maxPort) * 100}%` }} />
                    <div className="bg-emerald-500" style={{ width: `${(p.upBps / maxPort) * 100}%` }} />
                  </div>
                  <span className="w-32 flex-shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                    ↓{fmtBps(p.downBps)} ↑{fmtBps(p.upBps)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
