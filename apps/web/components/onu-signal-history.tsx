"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type Thresholds = { good: number; warning: number; danger: number };
type Point = { onuRx: number; time: number };

// Status of a dBm reading against the same thresholds the rest of the page uses.
function tone(v: number, th: Thresholds): "good" | "warning" | "critical" {
  return v >= th.good ? "good" : v >= th.warning ? "warning" : "critical";
}
const TONE_TEXT = {
  good: "text-emerald-600 dark:text-emerald-500",
  warning: "text-amber-600 dark:text-amber-500",
  critical: "text-rose-600 dark:text-rose-500",
} as const;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** ONU-RX optical signal over time, with the warning/critical thresholds drawn as dashed guide
 * lines so support sees at a glance whether a link is stable or drifting toward the limit. One
 * series (title names it → no legend); the guide lines carry status colour + a text label. */
export function OnuSignalHistory({ onuId, thresholds }: { onuId: number; thresholds?: Thresholds }) {
  const th = thresholds ?? { good: -25, warning: -27, danger: -30 };
  const [data, setData] = useState<Point[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { history } = await api.signalHistory(onuId);
      // API returns newest-first; chart wants oldest→newest, and only points with a reading.
      const pts = history
        .filter((h): h is { onuRx: number; oltRx: number | null; signalLevel: string | null; time: string } => h.onuRx != null)
        .map((h) => ({ onuRx: h.onuRx, time: new Date(h.time).getTime() }))
        .sort((a, b) => a.time - b.time);
      setData(pts);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [onuId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const vals = (data ?? []).map((p) => p.onuRx);
  const current = vals.length ? vals[vals.length - 1]! : null;
  const max = vals.length ? Math.max(...vals) : null;
  const min = vals.length ? Math.min(...vals) : null;
  // Domain padded to always show both the trace and the guide lines; better signal sits on top.
  const yMin = Math.floor(Math.min(min ?? th.danger, th.warning) - 2);
  const yMax = Math.ceil(Math.max(max ?? th.good, th.good) + 2);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Histori sinjali <span className="font-normal text-muted-foreground">(ONU RX)</span>
        </CardTitle>
        <div className="flex items-center gap-3">
          {current != null && (
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-muted-foreground">Tani <b className={TONE_TEXT[tone(current, th)]}>{fmt(current)}</b> dBm</span>
              {max != null && <span className="hidden text-muted-foreground sm:inline">Max <b className="text-foreground">{fmt(max)}</b></span>}
              {min != null && <span className="hidden text-muted-foreground sm:inline">Min <b className="text-foreground">{fmt(min)}</b></span>}
            </div>
          )}
          <button onClick={load} disabled={loading} className="text-muted-foreground transition hover:text-foreground" title="Rifresko">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {data === null ? (
          <Skeleton className="h-40 w-full" />
        ) : data.length < 2 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">Nuk ka ende histori sinjali për këtë ONU.</div>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t) => new Date(t as number).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit" })}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  minTickGap={40}
                  stroke="var(--color-border)"
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  width={44}
                  stroke="var(--color-border)"
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "dBm", angle: -90, position: "insideLeft", offset: 16, style: { fontSize: 10, fill: "var(--color-muted-foreground)" } }}
                />
                {/* Guide lines: good↔warning boundary (amber) and warning↔critical boundary (rose). */}
                <ReferenceLine y={th.good} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.8} label={{ value: `Kujdes ${th.good}`, position: "insideTopLeft", fill: "#f59e0b", fontSize: 9 }} />
                <ReferenceLine y={th.warning} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity={0.8} label={{ value: `Kritik ${th.warning}`, position: "insideBottomLeft", fill: "#f43f5e", fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", color: "var(--color-popover-foreground)" }}
                  labelFormatter={(t) => new Date(t as number).toLocaleString("sq-AL")}
                  formatter={(v: number) => [`${fmt(v)} dBm`, "ONU RX"]}
                />
                <Line type="monotone" dataKey="onuRx" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
