"use client";

import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Cpu, Thermometer, CircuitBoard, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

interface CardHealth {
  slot: number;
  card: string;
  cpu: number;
  temp: number;
}
interface Point {
  t: number;
  cpu: number;
  temp: number;
}
interface Health {
  available: boolean;
  cards: CardHealth[];
  series: Point[];
  maxCpu: number;
  maxTemp: number;
  avgCpu: number;
}

// ── Status thresholds ────────────────────────────────────────────────────────
// Reserved status tones (good / warning / critical), always paired with a value + icon so
// meaning never rests on colour alone. CPU is a load %; temperature is board °C on ZTE cards.
type Tone = "good" | "warning" | "critical";
const cpuTone = (v: number): Tone => (v >= 90 ? "critical" : v >= 75 ? "warning" : "good");
const tempTone = (v: number): Tone => (v >= 75 ? "critical" : v >= 55 ? "warning" : "good");

const TEXT: Record<Tone, string> = {
  good: "text-emerald-600 dark:text-emerald-500",
  warning: "text-amber-600 dark:text-amber-500",
  critical: "text-rose-600 dark:text-rose-500",
};
const BAR: Record<Tone, string> = { good: "bg-emerald-500", warning: "bg-amber-500", critical: "bg-rose-500" };
const STROKE: Record<Tone, string> = { good: "#10b981", warning: "#f59e0b", critical: "#f43f5e" };

/** A stat tile with a single-measure micro-sparkline (one axis, no dual-scale mixing). */
function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  tone,
  series,
  dataKey,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  unit: string;
  sub: string;
  tone: Tone;
  series: Point[];
  dataKey: "cpu" | "temp";
}) {
  const id = `spark-${dataKey}`;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold tabular-nums ${TEXT[tone]}`}>{Math.round(value)}</span>
          <span className="text-xs font-medium text-muted-foreground">{unit}</span>
        </div>
        {series.length > 1 && (
          <div className="h-8 w-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STROKE[tone]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={STROKE[tone]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={STROKE[tone]}
                  strokeWidth={1.75}
                  fill={`url(#${id})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

/** Professional OLT-health panel: fleet-card CPU% and temperature polled over SNMP. Replaces
 * the bulky per-PON bandwidth chart on the dashboard (that moved to the OLT detail page).
 * `bare` drops the outer Card so this can be embedded as a section inside another card
 * (dashboard merges it under the signal-distribution block with a thin divider). */
export function OltHealthCard({ oltId, bare = false }: { oltId: number; bare?: boolean }) {
  const [data, setData] = useState<Health | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    api
      .oltHealth(oltId)
      .then((r) => {
        setAvailable(r.available);
        if (r.available) setData(r as Health);
      })
      .catch(() => setAvailable(false));
  }, [oltId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const cards = data?.cards ?? [];
  const busiest = cards.reduce<CardHealth | null>((m, c) => (!m || c.cpu > m.cpu ? c : m), null);
  const hottest = cards.reduce<CardHealth | null>((m, c) => (!m || c.temp > m.temp ? c : m), null);
  const activeCount = cards.filter((c) => c.cpu > 0 || c.temp > 0).length;

  const titleRow = (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <Cpu className="h-4 w-4 text-primary" /> Gjendja e OLT
      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">SNMP</span>
      {available && data && (
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {cards.length} karta · {activeCount} aktive
        </span>
      )}
    </div>
  );

  const body = (
    <>
        {available === false ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            SNMP jo i disponueshëm për këtë OLT — aktivizoje community-n read për CPU/temperaturë.
          </div>
        ) : available === null || !data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton className="h-[76px]" />
              <Skeleton className="h-[76px]" />
              <Skeleton className="h-[76px]" />
            </div>
            <Skeleton className="h-24" />
          </div>
        ) : (
          <>
            {/* KPI row — each tile a single measure, its own axis */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiTile
                icon={Cpu}
                label="CPU më i ngarkuar"
                value={data.maxCpu}
                unit="%"
                sub={busiest ? `slot ${busiest.slot} · ${busiest.card} · mes. ${Math.round(data.avgCpu)}%` : "—"}
                tone={cpuTone(data.maxCpu)}
                series={data.series}
                dataKey="cpu"
              />
              <KpiTile
                icon={Thermometer}
                label="Temperatura më e lartë"
                value={data.maxTemp}
                unit="°C"
                sub={hottest ? `slot ${hottest.slot} · ${hottest.card}` : "—"}
                tone={tempTone(data.maxTemp)}
                series={data.series}
                dataKey="temp"
              />
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <CircuitBoard className="h-3.5 w-3.5" /> Karta aktive
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums text-foreground">{activeCount}</span>
                  <span className="text-xs font-medium text-muted-foreground">/ {cards.length}</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">CPU/temp që raportojnë</div>
              </div>
            </div>

            {/* Per-card meters — magnitude bars, values labelled, temp chip with icon */}
            <div className="mt-3 max-h-[168px] space-y-1 overflow-y-auto pr-1">
              {cards.map((c) => {
                const ct = cpuTone(c.cpu);
                const tt = tempTone(c.temp);
                const reports = c.cpu > 0 || c.temp > 0;
                return (
                  <div key={c.slot} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/50">
                    <span className="w-24 flex-shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                      <span className="text-foreground">S{c.slot}</span> · {c.card}
                    </span>
                    <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={c.cpu} aria-valuemin={0} aria-valuemax={100} aria-label={`CPU slot ${c.slot}`}>
                      {reports && <div className={BAR[ct]} style={{ width: `${Math.max(2, Math.min(100, c.cpu))}%` }} />}
                    </div>
                    <span className={`w-11 flex-shrink-0 text-right text-[11px] tabular-nums ${reports ? TEXT[ct] : "text-muted-foreground"}`}>
                      {reports ? `${Math.round(c.cpu)}%` : "—"}
                    </span>
                    <span className={`flex w-12 flex-shrink-0 items-center justify-end gap-0.5 text-[11px] tabular-nums ${reports ? TEXT[tt] : "text-muted-foreground"}`}>
                      <Thermometer className="h-3 w-3" />
                      {reports ? `${Math.round(c.temp)}°` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
    </>
  );

  if (bare) {
    return (
      <div>
        {titleRow}
        <div className="mt-3">{body}</div>
      </div>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">{titleRow}</CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
