"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Database,
  Server,
  Users,
  Wifi,
  WifiOff,
  ListTodo,
  Ticket,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface Overview {
  health: { db: boolean; redis: boolean; worker: boolean; workerLastBeat: string | null };
  counts: {
    olts: number;
    onus: number;
    users: number;
    openAlarms: number;
    openTickets: number;
    activeSessions: number;
    failedJobs24h: number;
  };
  queue: { waiting: number; active: number; delayed: number; failed: number };
  syncLagSec: number | null;
  olts: { id: number; name: string; status: string; lastSync: string | null; lagSec: number | null }[];
  recentJobs: {
    id: string;
    type: string;
    status: string;
    error: string | null;
    createdAt: string;
    oltId: number | null;
  }[];
}

function fmtLag(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm transition ${
        ok
          ? "border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-card"
          : "border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-card"
      }`}
    >
      <span
        className={`relative flex h-2.5 w-2.5 shrink-0 ${
          ok ? "text-emerald-500" : "text-rose-500"
        }`}
      >
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-40 ${
            ok ? "bg-emerald-400" : "animate-ping bg-rose-400"
          }`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            ok ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
        {label}
      </span>
      <span
        className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          ok
            ? "bg-emerald-500/15 text-emerald-700"
            : "bg-rose-500/15 text-rose-700"
        }`}
      >
        {ok ? "OK" : "DOWN"}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h2>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const d = await api.adminOverview();
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  if (err && !data) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-600">
        {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const c = data.counts;
  const cards = [
    { label: "OLT", value: c.olts, icon: Server, href: "/olts", accent: "text-blue-600 bg-blue-500/10" },
    { label: "ONU", value: c.onus, icon: Activity, href: "/onus", accent: "text-cyan-600 bg-cyan-500/10" },
    { label: "Përdorues", value: c.users, icon: Users, href: "/admin/users", accent: "text-violet-600 bg-violet-500/10" },
    {
      label: "Alarme hapur",
      value: c.openAlarms,
      icon: AlertTriangle,
      href: "/",
      accent: c.openAlarms > 0 ? "text-amber-600 bg-amber-500/10" : "text-slate-600 bg-slate-500/10",
      warn: c.openAlarms > 0,
    },
    { label: "Defekte aktive", value: c.openTickets, icon: Ticket, href: "/tickets", accent: "text-orange-600 bg-orange-500/10" },
    { label: "Sesione", value: c.activeSessions, icon: Wifi, href: "/admin/sessions", accent: "text-emerald-600 bg-emerald-500/10" },
    {
      label: "Jobs dështuar 24h",
      value: c.failedJobs24h,
      icon: ListTodo,
      href: "/admin/jobs",
      accent: c.failedJobs24h > 0 ? "text-rose-600 bg-rose-500/10" : "text-slate-600 bg-slate-500/10",
      warn: c.failedJobs24h > 0,
    },
    { label: "Sync lag", value: fmtLag(data.syncLagSec), icon: Database, href: "/admin", accent: "text-indigo-600 bg-indigo-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Health row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Shëndeti i sistemit</SectionTitle>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Rifresko
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <StatusDot ok={data.health.db} label="PostgreSQL" />
          <StatusDot ok={data.health.redis} label="Redis" />
          <StatusDot ok={data.health.worker} label="Worker" />
        </div>
      </div>

      {/* Metric cards */}
      <div className="space-y-2">
        <SectionTitle>Metrika</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Link key={card.label} href={card.href} className="group">
              <Card
                className={`h-full overflow-hidden border transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  card.warn ? "border-amber-500/25" : "hover:border-primary/25"
                }`}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`rounded-xl p-2.5 ${card.accent}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {card.label}
                    </div>
                    <div className="truncate text-2xl font-bold tracking-tight tabular-nums">
                      {card.value}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-muted/30 pb-3 pt-4">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Radha BullMQ
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2 p-4 text-center">
            {(
              [
                ["waiting", data.queue.waiting, "text-slate-700"],
                ["active", data.queue.active, "text-blue-600"],
                ["delayed", data.queue.delayed, "text-amber-600"],
                ["failed", data.queue.failed, "text-rose-600"],
              ] as const
            ).map(([k, v, color]) => (
              <div
                key={k}
                className="rounded-xl border border-border bg-gradient-to-b from-muted/40 to-card p-3"
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {k}
                </div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{v}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-muted/30 pb-3 pt-4">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              OLT Sync Lag
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-52 space-y-1 overflow-y-auto p-3">
            {data.olts.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nuk ka OLT.</p>
            )}
            {data.olts.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition hover:bg-muted/60"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  {o.status === "online" ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                  )}
                  <span className="truncate">{o.name}</span>
                </span>
                <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                  {fmtLag(o.lagSec)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-muted/30 pb-3 pt-4">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.14em]">
            Jobs të fundit
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-muted/20 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 pr-3">Tipi</th>
                <th className="py-2.5 pr-3">Status</th>
                <th className="py-2.5 pr-3">Koha</th>
                <th className="py-2.5 pr-4">Gabim</th>
              </tr>
            </thead>
            <tbody>
              {data.recentJobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Nuk ka jobs të fundit.
                  </td>
                </tr>
              )}
              {data.recentJobs.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-border/40 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-2 pr-3 font-mono text-[11px]">{j.type}</td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold uppercase tracking-wide ${
                        j.status === "done"
                          ? "border-emerald-500/30 text-emerald-600"
                          : j.status === "failed"
                            ? "border-rose-500/30 text-rose-600"
                            : ""
                      }`}
                    >
                      {j.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground tabular-nums">
                    {new Date(j.createdAt).toLocaleString("sq-AL")}
                  </td>
                  <td
                    className="max-w-[240px] truncate py-2 pr-4 text-rose-600"
                    title={j.error ?? undefined}
                  >
                    {j.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
