"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { useOlts } from "./providers";
import { api, pollJob, type AuditEntry } from "@/lib/api";
import { Card, Empty, Spinner } from "@/components/ui";

interface Stats {
  total: number;
  online: number;
  offline: number;
  criticalSignal: number;
  warningSignal: number;
}

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  add_olt: { label: "OLT u shtua", icon: "🔌" },
  delete_olt: { label: "OLT u fshi", icon: "🗑" },
  "olt-connect-test": { label: "Test lidhjeje OLT", icon: "🔌" },
  provision: { label: "ONU u autorizua", icon: "📡" },
  pppoe: { label: "PPPoE u konfigurua", icon: "🔐" },
  "authorize-pppoe": { label: "Autorizim + PPPoE", icon: "⚡" },
  wifi: { label: "WiFi u modifikua", icon: "📶" },
  "scan-unconfigured": { label: "Skanim ONU", icon: "🔍" },
  "refresh-onu": { label: "ONU u rifreskua", icon: "🔄" },
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
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!currentOlt) {
    return (
      <Card>
        <Empty icon="🔌">Shto OLT-in e parë për të filluar — kliko &ldquo;+ Shto OLT&rdquo; lart.</Empty>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold text-slate-900">Dashboard — {currentOlt.name}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {currentOlt.ip} · {currentOlt.location || "–"}
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard href="/unconfigured" color="from-blue-700 to-blue-900" icon="✨" label="Waiting authorization" value={waiting} />
        <StatCard
          href="/onus?filter=online"
          color="from-green-700 to-green-900"
          icon="📡"
          label="Online"
          value={stats?.online ?? "–"}
          sub={`Total: ${stats?.total ?? 0}`}
        />
        <StatCard href="/onus?filter=offline" color="from-slate-800 to-slate-950" icon="✖" label="Offline" value={stats?.offline ?? "–"} />
        <StatCard
          href="/onus?filter=low-signal"
          color="from-amber-700 to-amber-900"
          icon="⚠"
          label="Low signals"
          value={(stats?.warningSignal ?? 0) + (stats?.criticalSignal ?? 0)}
          sub={`Warn: ${stats?.warningSignal ?? 0} · Crit: ${stats?.criticalSignal ?? 0}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-3.5">
          <Card title={<>📊 Network Status</>}>
            <div className="h-[140px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <YAxis hide domain={[0, "auto"]} />
                  <Line type="monotone" dataKey="on" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title={<>📋 Aktiviteti i fundit</>}>
            <div className="max-h-[220px] overflow-y-auto px-4 py-2">
              {activity.length === 0 && <div className="py-4 text-xs text-slate-400">Asnjë aktivitet ende</div>}
              {activity.map((a) => {
                const meta = ACTION_LABELS[a.action] ?? { label: a.action, icon: "•" };
                return (
                  <div key={a.id} className="flex gap-2.5 border-b border-slate-100 py-2 text-xs last:border-0">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm">{meta.icon}</div>
                    <div>
                      <div className={a.result === "error" ? "text-red-600" : "text-slate-700"}>
                        {meta.label} {a.ponPort ? `· ${a.ponPort.replace("gpon-onu_", "")}` : ""}
                      </div>
                      <div className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleString("sq-AL")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        <Card title={<>🔌 OLT-et</>}>
          <div>
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{currentOlt.name}</div>
                <div className="text-[11px] text-slate-500">
                  {currentOlt.ip} · {currentOlt.location || "–"}
                </div>
              </div>
              <span className={`h-2 w-2 rounded-full ${currentOlt.status === "online" ? "bg-green-500" : "bg-red-500"}`} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  href,
  color,
  icon,
  label,
  value,
  sub,
}: {
  href: string;
  color: string;
  icon: string;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className={`relative block overflow-hidden rounded-xl bg-gradient-to-br ${color} px-5 py-4 text-white transition hover:brightness-110 active:brightness-95`}
    >
      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-25">{icon}</div>
      <div className="text-3xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[13px] font-medium opacity-90">{label}</div>
      {sub && <div className="mt-1.5 text-[11px] opacity-70">{sub}</div>}
    </Link>
  );
}
