"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import {
  Activity,
  Plug,
  Router,
  Server,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Wifi,
  WifiOff,
  Lock,
  Zap,
  Search,
  RefreshCw,
  Trash2,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { OltCardMap } from "@/components/olt-card-map";
import { PonTrafficCard } from "@/components/pon-traffic-card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useOlts } from "./providers";
import { api, type AuditEntry } from "@/lib/api";

interface ExpiringClient {
  id: number;
  name: string | null;
  ponPort: string;
  expiration: string | null;
  pppoeUser: string | null;
}
interface Stats {
  total: number;
  online: number;
  offline: number;
  criticalSignal: number;
  warningSignal: number;
  expiring: ExpiringClient[];
}

// Whole days from now until `iso` (negative = already expired).
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const ACTION_LABELS: Record<string, { label: string; icon: LucideIcon }> = {
  add_olt: { label: "OLT u shtua", icon: Server },
  delete_olt: { label: "OLT u fshi", icon: Trash2 },
  "olt-connect-test": { label: "Test lidhjeje OLT", icon: Server },
  provision: { label: "ONU u autorizua", icon: Router },
  pppoe: { label: "PPPoE u konfigurua", icon: Lock },
  "authorize-pppoe": { label: "Autorizim + PPPoE", icon: Zap },
  wifi: { label: "WiFi u modifikua", icon: Wifi },
  "scan-unconfigured": { label: "Skanim ONU", icon: Search },
  "refresh-onu": { label: "ONU u rifreskua", icon: RefreshCw },
};

const LEGEND_TONE = {
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
} as const;

function SignalLegend({
  href,
  icon: Icon,
  tone,
  label,
  value,
  pct,
}: {
  href: string;
  icon: LucideIcon;
  tone: keyof typeof LEGEND_TONE;
  label: string;
  value: number;
  pct: number;
}) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-card p-2.5 transition hover:bg-muted/50">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${LEGEND_TONE[tone]}`}>
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</div>
    </Link>
  );
}

export default function DashboardPage() {
  const { currentOlt, loading: oltsLoading } = useOlts();
  const [stats, setStats] = useState<Stats | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [history, setHistory] = useState<{ on: number }[]>(Array(20).fill({ on: 0 }));
  const [activity, setActivity] = useState<AuditEntry[]>([]);

  // Cheap, DB-only reads — safe to poll often. The "waiting authorization" count comes
  // from the persisted unconfigured set (kept current by the worker's inventory sync), so
  // it's always accurate without a live `show gpon onu uncfg` scan from the browser.
  const refresh = useCallback(async () => {
    if (!currentOlt) return;
    // Each card is fetched independently — a failure in one (e.g. the unconfigured
    // endpoint) must never blank the others, so we don't await them together.
    const oltId = currentOlt.id;
    api
      .stats(oltId)
      .then((statsRes) => {
        setStats(statsRes);
        setHistory((prev) => [...prev.slice(1), { on: statsRes.online }]);
      })
      .catch(() => {});
    api.audit(oltId).then((r) => setActivity(r.logs)).catch(() => {});
    api.unconfigured(oltId).then((r) => setWaiting(r.total)).catch(() => {});
  }, [currentOlt]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Signal mix across the online fleet. warning/critical are measured (last 10 min);
  // "good" is the remaining online ONUs. Clamped so a stale count can't go negative.
  const signalMix = useMemo(() => {
    const online = stats?.online ?? 0;
    const warning = Math.min(stats?.warningSignal ?? 0, online);
    const critical = Math.min(stats?.criticalSignal ?? 0, online - warning);
    const good = Math.max(0, online - warning - critical);
    const pct = (n: number) => (online > 0 ? (n / online) * 100 : 0);
    return { good, warning, critical, online, pct };
  }, [stats]);

  if (oltsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!currentOlt) {
    return (
      <Card>
        <EmptyState>
          Shto OLT-in e parë për të filluar — kliko &ldquo;Shto OLT&rdquo; në menunë kryesore.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard — {currentOlt.name}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {currentOlt.ip} · {currentOlt.location || "–"}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard href="/unconfigured" icon={Plug} label="Waiting authorization" value={waiting} gradient="from-blue-600 to-blue-800" />
        <StatCard href="/onus?filter=online" icon={Wifi} label="Online" value={stats?.online ?? "–"} sub={`Total: ${stats?.total ?? 0}`} gradient="from-emerald-600 to-emerald-800" />
        <StatCard href="/onus?filter=offline" icon={WifiOff} label="Offline" value={stats?.offline ?? "–"} gradient="from-slate-700 to-slate-900" />
        <StatCard href="/onus?filter=low-signal" icon={SignalHigh} label="Low signals" value={(stats?.warningSignal ?? 0) + (stats?.criticalSignal ?? 0)} sub={`Warn: ${stats?.warningSignal ?? 0} · Crit: ${stats?.criticalSignal ?? 0}`} gradient="from-amber-600 to-amber-800" />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Signal distribution across the online fleet */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <SignalHigh className="h-4 w-4 text-primary" /> Shpërndarja e sinjaleve
              <span className="ml-auto text-xs font-normal text-muted-foreground">{signalMix.online} online</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-emerald-500" style={{ width: `${signalMix.pct(signalMix.good)}%` }} />
              <div className="bg-amber-500" style={{ width: `${signalMix.pct(signalMix.warning)}%` }} />
              <div className="bg-rose-500" style={{ width: `${signalMix.pct(signalMix.critical)}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <SignalLegend href="/onus?signal=good" icon={SignalHigh} tone="emerald" label="Good" value={signalMix.good} pct={signalMix.pct(signalMix.good)} />
              <SignalLegend href="/onus?signal=warning" icon={SignalMedium} tone="amber" label="Warning" value={signalMix.warning} pct={signalMix.pct(signalMix.warning)} />
              <SignalLegend href="/onus?signal=critical" icon={SignalLow} tone="rose" label="Critical" value={signalMix.critical} pct={signalMix.pct(signalMix.critical)} />
            </div>
          </CardContent>
        </Card>

        {/* Clients expiring / expired within 7 days — the office worklist */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-primary" /> Skadojnë së shpejti
              <span className="ml-auto text-xs font-normal text-muted-foreground">{stats?.expiring?.length ?? 0}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[180px] overflow-y-auto">
              {(stats?.expiring?.length ?? 0) === 0 && (
                <div className="py-4 text-xs text-muted-foreground">Asnjë klient që skadon këtë javë</div>
              )}
              {stats?.expiring?.map((c) => {
                const d = daysUntil(c.expiration);
                const badge =
                  d === null ? "—" : d < 0 ? `Skaduar ${-d}d` : d === 0 ? "Sot" : `${d}d`;
                const tone =
                  d !== null && d < 0
                    ? "bg-rose-500/15 text-rose-600"
                    : d !== null && d <= 3
                      ? "bg-amber-500/15 text-amber-600"
                      : "bg-muted text-muted-foreground";
                return (
                  <Link
                    key={c.id}
                    href={`/onus/${c.id}`}
                    className="flex items-center gap-2 border-b border-border/50 py-2 text-xs last:border-0 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">{c.name || c.pppoeUser || "–"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {c.ponPort.replace("gpon-onu_", "")} · {c.expiration ? new Date(c.expiration).toLocaleDateString("sq-AL") : "–"}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{badge}</span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-5">
        <PonTrafficCard oltId={currentOlt.id} />
      </div>

      <div className="mb-5">
        <OltCardMap oltId={currentOlt.id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-3.5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" /> Network Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <YAxis hide domain={[0, "auto"]} />
                    <Line type="monotone" dataKey="on" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <RefreshCw className="h-4 w-4 text-primary" /> Aktiviteti i fundit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[220px] overflow-y-auto">
                {activity.length === 0 && <div className="py-4 text-xs text-muted-foreground">Asnjë aktivitet ende</div>}
                {activity.map((a) => {
                  const meta = ACTION_LABELS[a.action] ?? { label: a.action, icon: Activity };
                  const Icon = meta.icon;
                  return (
                    <div key={a.id} className="flex gap-2.5 border-b border-border/50 py-2 text-xs last:border-0">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className={a.result === "error" ? "text-rose-600" : "text-foreground"}>
                          {meta.label} {a.ponPort ? `· ${a.ponPort.replace("gpon-onu_", "")}` : ""}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString("sq-AL")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Server className="h-4 w-4 text-primary" /> OLT-et
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium text-foreground">{currentOlt.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {currentOlt.ip} · {currentOlt.location || "–"}
                </div>
              </div>
              <span className={`h-2 w-2 rounded-full ${currentOlt.status === "online" ? "bg-emerald-500" : "bg-rose-500"}`} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
