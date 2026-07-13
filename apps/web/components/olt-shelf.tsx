"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, RefreshCw, Zap, Radio, Server, Battery, ArrowUpFromLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { api, type ShelfCard, type UplinkPort, type CardRole } from "@/lib/api";

/** NetNumen-style chassis: every board from `show card` + live per-card ONU counts (GPON/EPON)
 * and uplink optical signal levels (XGE/GE), colour-coded by DDM threshold. */
export function OltShelf({ oltId }: { oltId: number }) {
  const [data, setData] = useState<{ at: string | null; cards: ShelfCard[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { at, cards } = await api.oltShelf(oltId);
      setData({ at, cards });
    } catch {
      setData({ at: null, cards: [] });
    } finally {
      setLoading(false);
    }
  }, [oltId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="h-4 w-4 text-primary" /> Shasia — kartat &amp; uplink-et
        </CardTitle>
        <div className="flex items-center gap-3">
          {data?.at && (
            <span className="hidden text-[10px] text-muted-foreground sm:inline" title={new Date(data.at).toLocaleString()}>
              përditësuar {timeAgo(data.at)}
            </span>
          )}
          <Legend />
          <button onClick={load} disabled={loading} className="text-muted-foreground transition hover:text-foreground" title="Rifresko">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {data === null ? (
          <Skeleton className="h-40 w-full" />
        ) : data.cards.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nuk ka të dhëna të shasisë ende — pritet sinkronizimi i parë.</div>
        ) : (
          <TooltipProvider>
            {data.cards.map((c) => (
              <CardRow key={`${c.slot}-${c.realType}`} card={c} />
            ))}
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

// ── one board ────────────────────────────────────────────────────────────────
function CardRow({ card }: { card: ShelfCard }) {
  const meta = ROLE_META[card.role] ?? ROLE_META.other;
  const Icon = meta.icon;
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-3 py-2 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-slate-700 text-[11px] font-bold text-white">{card.slot}</span>
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${meta.chip}`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
          <span className="truncate text-sm font-semibold tracking-wide">{card.realType || "—"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px]">
          {card.onus && (
            <span className="text-slate-300">
              <span className="font-semibold text-white">{card.onus.total}</span> ONU · <span className="text-emerald-400">{card.onus.online}</span>
            </span>
          )}
          <StatusPill status={card.status} />
        </div>
      </div>
      {(card.role === "gpon" || card.role === "epon") && <PonBody card={card} />}
      {(card.role === "uplink-xge" || card.role === "uplink-ge") && <UplinkBody card={card} />}
    </div>
  );
}

// Per-port colour: green = all online, amber = partially, rose = all down, muted = empty.
function ponPortClass(total: number, online: number): string {
  if (total === 0) return "border-border bg-muted/30 text-muted-foreground";
  if (online === total) return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (online === 0) return "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

// GPON/EPON access board — per-port ONU counts (big number), linked to the filtered ONU list.
function PonBody({ card }: { card: ShelfCard }) {
  const ports =
    card.portOnus ??
    Array.from({ length: card.ports && card.ports > 0 ? card.ports : card.role === "epon" ? 8 : 16 }, (_, i) => ({ port: i + 1, total: 0, online: 0 }));
  return (
    <div className="grid grid-cols-4 gap-1.5 p-2.5 sm:grid-cols-8">
      {ports.map((p) => {
        const q = encodeURIComponent(`${card.slot}/${p.port}:`);
        const tile = (
          <div className={`flex h-11 flex-col items-center justify-center rounded-md border text-center transition ${ponPortClass(p.total, p.online)} ${p.total ? "hover:brightness-95" : ""}`}>
            <span className="text-[9px] font-medium opacity-70">P{p.port}</span>
            <span className="text-sm font-bold leading-none">{p.total || "–"}</span>
          </div>
        );
        if (!p.total) return <div key={p.port} title={`Porta ${card.slot}/${p.port} · bosh`}>{tile}</div>;
        return (
          <Link key={p.port} href={`/onus?q=${q}`} title={`Porta ${card.slot}/${p.port} · ${p.total} ONU · ${p.online} online`}>
            {tile}
          </Link>
        );
      })}
    </div>
  );
}

// Uplink board — per-port optical signal tiles.
function UplinkBody({ card }: { card: ShelfCard }) {
  const ports = card.uplinks ?? [];
  return (
    <div className="grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-4">
      {ports.map((u) => (
        <UplinkTile key={u.port} u={u} band={card.role === "uplink-xge" ? "XGE" : "GE"} />
      ))}
    </div>
  );
}

function UplinkTile({ u, band }: { u: UplinkPort; band: string }) {
  const st = uplinkStatus(u);
  const c = SIG_STYLE[st];
  if (!u.present) {
    return (
      <div className="flex h-16 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-center">
        <span className="text-[10px] font-medium text-muted-foreground">P{u.port} · {band}</span>
        <span className="text-[11px] text-muted-foreground/60">pa modul</span>
      </div>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex h-16 flex-col justify-between rounded-md border p-1.5 ${c.box}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold">P{u.port} · {band}</span>
            <span className={`h-2 w-2 rounded-full ${c.dot}`} />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm font-bold leading-none">{fmt(u.rxPower)}<span className="ml-0.5 text-[9px] font-normal opacity-70">Rx</span></div>
              <div className="text-[10px] leading-tight opacity-80">{fmt(u.txPower)} <span className="text-[8px] opacity-70">Tx</span></div>
            </div>
            {u.up === false && <span className="rounded bg-rose-600 px-1 text-[8px] font-bold text-white">DOWN</span>}
          </div>
          <SignalBar u={u} status={st} />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px]">
        <div className="space-y-0.5 text-[11px]">
          <div className="font-semibold">{u.name}</div>
          {u.moduleType && <div>Moduli: {u.moduleType}{u.vendor ? ` · ${u.vendor}` : ""}</div>}
          <div>Rx: {fmt(u.rxPower)} dbm {u.rxLower != null && `(prag ${u.rxLower}…${u.rxUpper})`}</div>
          <div>Tx: {fmt(u.txPower)} dbm</div>
          {u.temp != null && <div>Temp: {u.temp} °C · Vol: {fmt(u.vol)} v · Bias: {fmt(u.bias)} mA</div>}
          <div>Link: {u.up == null ? "—" : u.up ? "Up" : "Down"} · {SIG_LABEL[st]}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Thin bar showing Rx power within its alarm window [lower … upper].
function SignalBar({ u, status }: { u: UplinkPort; status: SigStatus }) {
  const lo = u.rxLower ?? -34;
  const hi = u.rxUpper ?? 3;
  const rx = u.rxPower;
  const pct = rx == null ? 0 : Math.max(0, Math.min(100, ((rx - lo) / (hi - lo)) * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div className={`h-full rounded-full ${SIG_STYLE[status].bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === "INSERVICE" ? "bg-emerald-500/20 text-emerald-300" : s === "STANDBY" ? "bg-sky-500/20 text-sky-300" : s === "" ? "hidden" : "bg-rose-500/20 text-rose-300";
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${cls}`}>{status || "—"}</span>;
}

// ── helpers ──────────────────────────────────────────────────────────────────
type SigStatus = "ok" | "warn" | "bad" | "empty";

function uplinkStatus(u: UplinkPort): SigStatus {
  if (!u.present) return "empty";
  if (u.up === false || u.rxPower == null) return "bad";
  const lo = u.rxLower ?? -34;
  const hi = u.rxUpper ?? 3;
  if (u.rxPower <= lo || u.rxPower >= hi) return "bad";
  if (u.rxPower <= lo + 3 || u.rxPower >= hi - 2) return "warn";
  return "ok";
}

const SIG_STYLE: Record<SigStatus, { box: string; dot: string; bar: string }> = {
  ok: { box: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  warn: { box: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", dot: "bg-amber-500", bar: "bg-amber-500" },
  bad: { box: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-500", bar: "bg-rose-500" },
  empty: { box: "border-border bg-muted/20 text-muted-foreground", dot: "bg-muted-foreground", bar: "bg-muted-foreground" },
};
const SIG_LABEL: Record<SigStatus, string> = { ok: "Mirë", warn: "Kufitar", bad: "I keq / humbje", empty: "Pa modul" };

const ROLE_META: Record<CardRole, { label: string; chip: string; icon: typeof Cpu }> = {
  "power": { label: "Ushqim", chip: "bg-zinc-500/25 text-zinc-200", icon: Battery },
  "control": { label: "Kontroll", chip: "bg-slate-400/25 text-slate-200", icon: Server },
  "gpon": { label: "GPON", chip: "bg-emerald-500/25 text-emerald-200", icon: Radio },
  "epon": { label: "EPON", chip: "bg-sky-500/25 text-sky-200", icon: Radio },
  "uplink-xge": { label: "Uplink 10GE", chip: "bg-violet-500/25 text-violet-200", icon: ArrowUpFromLine },
  "uplink-ge": { label: "Uplink GE", chip: "bg-amber-500/25 text-amber-200", icon: ArrowUpFromLine },
  "other": { label: "Kartë", chip: "bg-slate-500/25 text-slate-200", icon: Zap },
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2));

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s më parë`;
  if (s < 3600) return `${Math.floor(s / 60)} min më parë`;
  if (s < 86400) return `${Math.floor(s / 3600)} orë më parë`;
  return `${Math.floor(s / 86400)} ditë më parë`;
}

function Legend() {
  const items: [string, string][] = [
    ["bg-emerald-500", "sinjal mirë"],
    ["bg-amber-500", "kufitar"],
    ["bg-rose-500", "i keq / down"],
    ["bg-muted", "pa modul"],
  ];
  return (
    <div className="hidden items-center gap-2.5 text-[10px] text-muted-foreground lg:flex">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ${c}`} /> {l}
        </span>
      ))}
    </div>
  );
}
