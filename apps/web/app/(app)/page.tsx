"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import {
  Activity,
  Cable,
  Plug,
  Router,
  Server,
  SignalHigh,
  Wifi,
  WifiOff,
  Lock,
  Zap,
  Search,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useOlts } from "./providers";
import { api, pollJob, type AuditEntry } from "@/lib/api";

interface Stats {
  total: number;
  online: number;
  offline: number;
  criticalSignal: number;
  warningSignal: number;
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

export default function DashboardPage() {
  const { currentOlt, loading: oltsLoading } = useOlts();
  const [stats, setStats] = useState<Stats | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [history, setHistory] = useState<{ on: number }[]>(Array(20).fill({ on: 0 }));
  const [activity, setActivity] = useState<AuditEntry[]>([]);

  // Cheap, DB-only reads — safe to poll often.
  const refresh = useCallback(async () => {
    if (!currentOlt) return;
    try {
      const [statsRes, auditRes] = await Promise.all([api.stats(currentOlt.id), api.audit(currentOlt.id)]);
      setStats(statsRes);
      setActivity(auditRes.logs);
      setHistory((prev) => [...prev.slice(1), { on: statsRes.online }]);
    } catch {
      // keep last known stats on transient errors
    }
  }, [currentOlt]);

  // Opens a real Telnet/SSH session to the OLT (`show gpon onu uncfg`) — much
  // more expensive than the DB-backed stats above, and contends for the
  // per-OLT device lock with provisioning actions. Refresh far less often;
  // the Unconfigured page's own "Skano" button covers on-demand freshness.
  const refreshWaiting = useCallback(async () => {
    if (!currentOlt) return;
    try {
      const { jobId } = await api.scanUnconfigured(currentOlt.id);
      const job = await pollJob(jobId).catch(() => null);
      const output = job?.output as { total?: number } | null;
      if (output?.total !== undefined) setWaiting(output.total);
    } catch {
      // keep last known count on transient errors
    }
  }, [currentOlt]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    refreshWaiting();
    const id = setInterval(refreshWaiting, 300_000);
    return () => clearInterval(id);
  }, [refreshWaiting]);

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
                    <Line type="monotone" dataKey="on" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
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
                        <div className={a.result === "error" ? "text-rose-400" : "text-foreground"}>
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
