"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Search, Eye, Lock, Trash2, MoreVertical, Rows3, Rows4, RotateCw, Download, X, SignalHigh, SignalMedium, SignalLow } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignalPill } from "@/components/signal-pill";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useOlts, useMe } from "../providers";
import { api, type OnuRow } from "@/lib/api";
import { can } from "@/lib/permissions";
import { formatPonPort, isEponPort, onuConnectionKind, classifySignal } from "@oltflow/core";
import { PppoeModal } from "@/components/pppoe-modal";
import { DeleteOnuDialog } from "@/components/delete-onu-dialog";
import { PingButton } from "@/components/ping-button";
import { WinboxButton } from "@/components/winbox-button";

type StatusFilter = "all" | "online" | "offline";
type BrFilter = "all" | "route" | "bridge";
type SignalBand = "all" | "good" | "warning" | "critical";

/** Single-source optical bands (good ≥ -25, warning -27..-25, critical < -27) from
 * @oltflow/core — same thresholds the worker uses to store signalLevel and fire alarms. */
function isLowSignal(rx: number | null | undefined): boolean {
  const b = classifySignal(rx);
  return b === "warning" || b === "critical";
}

/** Renders the RADIUS expiry date colored by urgency: red = expired, amber ≤ 7 days, else muted. */
function ExpiryCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">–</span>;
  const d = new Date(iso);
  // eslint-disable-next-line react-hooks/purity -- read-only display of days remaining
  const days = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  const cls = days < 0 ? "text-rose-600 font-semibold" : days <= 7 ? "text-amber-600 font-semibold" : "text-foreground";
  return (
    <span className={`font-mono text-[11px] ${cls}`} title={days < 0 ? `Skaduar ${-days} ditë më parë` : `${days} ditë të mbetura`}>
      {d.toLocaleDateString("sq-AL")}
    </span>
  );
}

const CSV_COLS: { key: keyof OnuRow; label: string }[] = [
  { key: "ponPort", label: "Port" },
  { key: "serial", label: "Serial" },
  { key: "name", label: "Emri" },
  { key: "type", label: "Tipi" },
  { key: "state", label: "State" },
  { key: "onuRx", label: "Sinjali_dBm" },
  { key: "wanIp", label: "IP_WAN" },
  { key: "mgmtIp", label: "Mikrotik_IP" },
  { key: "expiration", label: "Skadenca" },
  { key: "onlineDuration", label: "Online" },
];

// Distinct tint per OLT so the OLT column reads as categories at a glance in "All OLTs" mode.
const OLT_TINTS = [
  "border-blue-500/30 bg-blue-500/10 text-blue-600",
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  "border-amber-500/30 bg-amber-500/10 text-amber-600",
  "border-violet-500/30 bg-violet-500/10 text-violet-600",
  "border-rose-500/30 bg-rose-500/10 text-rose-600",
  "border-cyan-500/30 bg-cyan-500/10 text-cyan-600",
  "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-600",
  "border-teal-500/30 bg-teal-500/10 text-teal-600",
];
const oltTint = (id?: number) => OLT_TINTS[(((id ?? 0) % OLT_TINTS.length) + OLT_TINTS.length) % OLT_TINTS.length];

/** Client-side CSV export of the given ONU rows (UTF-8 BOM for Excel). Prepends an OLT
 * column when the rows span multiple OLTs (the "All OLTs" view). */
function exportCsv(rows: OnuRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = rows.some((r) => r.oltName)
    ? [{ key: "oltName" as keyof OnuRow, label: "OLT" }, ...CSV_COLS]
    : CSV_COLS;
  const csv = [
    cols.map((c) => c.label).join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `onu-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Distinct color per filter group so the toolbar reads as separate boxes, not one blob.
const BOX_BORDER: Record<string, string> = {
  slate: "border-slate-300",
  indigo: "border-indigo-400/50",
  amber: "border-amber-400/60",
  blue: "border-blue-400/50",
};
const BOX_LABEL: Record<string, string> = {
  slate: "text-slate-500",
  indigo: "text-indigo-600",
  amber: "text-amber-600",
  blue: "text-blue-600",
};

function FilterBox({ label, color, children }: { label: string; color: keyof typeof BOX_BORDER; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 shadow-sm ${BOX_BORDER[color]}`}>
      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${BOX_LABEL[color]}`}>{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition sm:px-3 sm:py-1 sm:text-xs ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// Signal band chips: text + icon always tinted in the band colour (green/amber/red),
// with a stronger fill when active — so the office spots the band at a glance.
const SIGNAL_TONE = {
  good: { idle: "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10", active: "border-emerald-500 bg-emerald-500/15 text-emerald-700" },
  warning: { idle: "border-amber-500/40 text-amber-600 hover:bg-amber-500/10", active: "border-amber-500 bg-amber-500/20 text-amber-700" },
  critical: { idle: "border-rose-500/40 text-rose-600 hover:bg-rose-500/10", active: "border-rose-500 bg-rose-500/15 text-rose-700" },
} as const;

function SignalChip({
  band,
  active,
  onClick,
  icon: Icon,
  label,
}: {
  band: keyof typeof SIGNAL_TONE;
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const tone = SIGNAL_TONE[band];
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition sm:px-3 sm:py-1 sm:text-xs ${active ? tone.active : `bg-card ${tone.idle}`}`}
    >
      <Icon className="hidden h-3.5 w-3.5 sm:inline" /> {label}
    </button>
  );
}

export default function OnusPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground">Duke ngarkuar...</div>}>
      <OnusContent />
    </Suspense>
  );
}

function OnusContent() {
  const { currentOlt, allOlts, olts } = useOlts();
  const me = useMe();
  const operate = can.operate(me?.role);
  const admin = can.admin(me?.role);
  const searchParams = useSearchParams();
  const urlFilter = searchParams.get("filter");
  const urlSignal = searchParams.get("signal");
  const [onus, setOnus] = useState<OnuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    urlFilter === "online" || urlFilter === "offline" ? urlFilter : "all"
  );
  const [brFilter, setBrFilter] = useState<BrFilter>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [signalBand, setSignalBand] = useState<SignalBand>(
    urlSignal === "good" || urlSignal === "warning" || urlSignal === "critical" ? urlSignal : "all"
  );
  const [sortExpiry, setSortExpiry] = useState(false);
  const [comfortable, setComfortable] = useState(false);
  const [pppoeTarget, setPppoeTarget] = useState<{ oltId: number; ponPort: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OnuRow | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  async function load() {
    if (!allOlts && !currentOlt) return;
    setLoading(true);
    try {
      // "All OLTs" mode hits the global endpoint so support can find any customer
      // across the whole fleet; otherwise the per-OLT list.
      const { onus } = allOlts ? await api.allOnus() : await api.onus(currentOlt!.id);
      setOnus(onus);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function restartOne(o: OnuRow) {
    if (!confirm(`Riniso ONU-në "${o.name || o.ponPort}"? Lidhja do të ndërpritet për pak.`)) return;
    setBusyMsg(`Duke rinisur ${o.name || o.ponPort}...`);
    try {
      await api.restartOnu(o.id);
      setBusyMsg(`Komanda e restart-it u dërgua për ${o.name || o.ponPort}.`);
    } catch {
      setBusyMsg("Restart dështoi.");
    }
  }

  async function restartSelected(ids: number[]) {
    if (!confirm(`Riniso ${ids.length} ONU të zgjedhura? Lidhja e tyre do të ndërpritet.`)) return;
    setBusyMsg(`Duke rinisur ${ids.length} ONU...`);
    let ok = 0;
    for (const id of ids) {
      try {
        await api.restartOnu(id);
        ok++;
      } catch {
        /* continue */
      }
    }
    setBusyMsg(`Restart u dërgua për ${ok}/${ids.length} ONU.`);
    setSelected(new Set());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOlt?.id, allOlts]);

  const models = Array.from(new Set(onus.map((o) => o.type).filter(Boolean) as string[])).sort();

  const base = onus
    .filter((o) => statusFilter === "all" || (statusFilter === "online" ? o.state === "working" : o.state !== "working"))
    .filter((o) => urlFilter !== "low-signal" || isLowSignal(o.onuRx))
    .filter((o) => brFilter === "all" || onuConnectionKind(o.type) === brFilter)
    .filter((o) => modelFilter === "all" || o.type === modelFilter)
    // Optical signal band filter: good / warning / critical (near LOSS).
    .filter((o) => signalBand === "all" || classifySignal(o.onuRx) === signalBand)
    .filter((o) => `${o.ponPort}${o.serial ?? ""}${o.name ?? ""}${o.type ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  // Optional sort by expiry (Skadenca header): expired / soonest-to-expire on top; null last.
  const filtered = sortExpiry
    ? [...base].sort((a, b) => {
        const ax = a.expiration ? new Date(a.expiration).getTime() : null;
        const bx = b.expiration ? new Date(b.expiration).getTime() : null;
        if (ax === null && bx === null) return 0;
        if (ax === null) return 1;
        if (bx === null) return -1;
        return ax - bx;
      })
    : base;

  if (!currentOlt && !allOlts) {
    return (
      <Card>
        <EmptyState>Zgjidh ose shto një OLT.</EmptyState>
      </Card>
    );
  }

  const rowPad = comfortable ? "[&>td]:py-3" : "[&>td]:py-1";

  return (
    <div>
      <div className="mb-4">
        {/* Title + top-right actions (one row on every size, so CSV/Rifresko stay top-right). */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {allOlts ? "ONU-të — Të gjitha OLT-të" : "ONU-të e Konfiguruara"}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {allOlts ? `${olts.length} OLT` : currentOlt?.name} · {filtered.length} nga {onus.length} ONU
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setComfortable((v) => !v)}
              title={comfortable ? "Dendësi kompakte" : "Dendësi e rehatshme"}
            >
              {comfortable ? <Rows3 className="h-4 w-4" /> : <Rows4 className="h-4 w-4" />}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportCsv(filtered)} title="Eksporto CSV (të filtruarat)">
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading} title="Rifresko listën">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Rifresko</span>
            </Button>
          </div>
        </div>
        {/* Search: full-width on mobile, constrained on desktop. */}
        <div className="relative mt-3 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kërko SN, port, emër..."
            className="w-full pl-9 font-mono"
          />
        </div>
      </div>

      {busyMsg && (
        <div className="mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">{busyMsg}</div>
      )}

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
          <span className="text-sm font-semibold text-primary">{selected.size} të zgjedhura</span>
          <Button size="sm" variant="secondary" onClick={() => restartSelected([...selected])}>
            <RotateCw className="mr-1 h-4 w-4" /> Riniso
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exportCsv(filtered.filter((o) => selected.has(o.id)))}>
            <Download className="mr-1 h-4 w-4" /> Eksporto CSV
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Pastro
          </button>
        </div>
      )}

      {/* Filters — each group in its own colored box. Stack full-width on mobile (chips wrap
          inside) so nothing needs horizontal scrolling; flow in a wrapping row on sm+. */}
      <div className="mb-3 flex flex-col items-start gap-2 pb-1 sm:flex-row sm:flex-wrap sm:items-stretch">
        <FilterBox label="Status" color="slate">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Të gjitha</Chip>
          <Chip active={statusFilter === "online"} onClick={() => setStatusFilter("online")}>Online</Chip>
          <Chip active={statusFilter === "offline"} onClick={() => setStatusFilter("offline")}>Offline</Chip>
        </FilterBox>
        <FilterBox label="Tipi" color="indigo">
          <Chip active={brFilter === "all"} onClick={() => setBrFilter("all")}>Të gjitha</Chip>
          <Chip active={brFilter === "route"} onClick={() => setBrFilter("route")}>Route</Chip>
          <Chip active={brFilter === "bridge"} onClick={() => setBrFilter("bridge")}>Bridge</Chip>
        </FilterBox>
        <FilterBox label="Signal" color="amber">
          <Chip active={signalBand === "all"} onClick={() => setSignalBand("all")}>All</Chip>
          <SignalChip band="good" active={signalBand === "good"} onClick={() => setSignalBand("good")} icon={SignalHigh} label="Good" />
          <SignalChip band="warning" active={signalBand === "warning"} onClick={() => setSignalBand("warning")} icon={SignalMedium} label="Warning" />
          <SignalChip band="critical" active={signalBand === "critical"} onClick={() => setSignalBand("critical")} icon={SignalLow} label="Critical" />
        </FilterBox>
        {models.length > 1 && (
          <FilterBox label="Model" color="blue">
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue placeholder="Të gjitha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Të gjitha</SelectItem>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBox>
        )}
      </div>

      {loading && onus.length === 0 ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState>Asnjë ONU</EmptyState>
        </Card>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((o) => (
              <Card key={o.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {allOlts && o.oltName && (
                      <Badge variant="outline" className={`mb-1 ${oltTint(o.oltId)}`}>{o.oltName}</Badge>
                    )}
                    <div className="truncate font-semibold">{o.name || "–"}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-primary">
                      {formatPonPort(o.ponPort)} {isEponPort(o.ponPort) && <Badge variant="secondary">EPON</Badge>}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{o.serial || "–"}</div>
                  </div>
                  <StatusBadge state={o.state} />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <SignalPill rx={o.onuRx} />
                  <span className="font-mono text-[11px] text-muted-foreground">{o.type || "–"}</span>
                  {o.wanIp && (
                    <>
                      <a href={`http://${o.wanIp}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-primary hover:underline">
                        {o.wanIp} ↗
                      </a>
                      <PingButton ip={o.wanIp} />
                    </>
                  )}
                  {!o.wanIp && onuConnectionKind(o.type) === "bridge" && (
                    <WinboxButton onuId={o.id} mgmtIp={o.mgmtIp} winboxUrl={o.winboxUrl} mac={o.mac} onSaved={load} />
                  )}
                  {o.expiration && (
                    <span className="text-[11px] text-muted-foreground">Skadenca: <ExpiryCell iso={o.expiration} /></span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button asChild size="sm">
                    <Link href={`/onus/${o.id}`}>
                      <Eye className="mr-1 h-4 w-4" /> View
                    </Link>
                  </Button>
                  {operate && !isEponPort(o.ponPort) ? (
                    <Button size="sm" variant="secondary" onClick={() => { const oid = o.oltId ?? currentOlt?.id; if (oid) setPppoeTarget({ oltId: oid, ponPort: o.ponPort }); }}>
                      <Lock className="mr-1 h-4 w-4" /> PPPoE
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: table — fixed layout so columns never reflow on filter/refresh */}
          <div className="hidden overflow-x-auto rounded-md border bg-card md:block">
            <Table className={`${allOlts ? "min-w-[1240px]" : "min-w-[1100px]"} table-fixed`}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    {operate && (
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={filtered.length > 0 && filtered.every((o) => selected.has(o.id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((o) => o.id)) : new Set())}
                      />
                    )}
                  </TableHead>
                  {allOlts && <TableHead className="w-32 text-[10px] uppercase">OLT</TableHead>}
                  <TableHead className="w-24 text-[10px] uppercase">Status</TableHead>
                  <TableHead className="w-36 text-[10px] uppercase">Serial</TableHead>
                  <TableHead className="w-64 text-[10px] uppercase">Emër Mbiemër</TableHead>
                  <TableHead className="w-36 text-[10px] uppercase">Tipi ONU</TableHead>
                  <TableHead className="w-20 text-[10px] uppercase">B/R</TableHead>
                  <TableHead className="w-32 text-[10px] uppercase">Sinjali</TableHead>
                  <TableHead className="w-52 text-[10px] uppercase">IP (WAN)</TableHead>
                  <TableHead className="w-28 text-[10px] uppercase">
                    <button
                      onClick={() => setSortExpiry((v) => !v)}
                      className={`inline-flex items-center gap-1 uppercase transition hover:text-foreground ${sortExpiry ? "text-primary" : ""}`}
                      title="Rendit sipas skadencës (të skaduarit lart)"
                    >
                      Skadenca {sortExpiry ? "↑" : "⇅"}
                    </button>
                  </TableHead>
                  <TableHead className="w-28 text-[10px] uppercase">Online</TableHead>
                  <TableHead className="w-32 text-right text-[10px] uppercase">Veprime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o, i) => {
                  const online = o.state === "working";
                  const borderColor = online
                    ? "var(--color-success)"
                    : o.state
                      ? "var(--color-destructive)"
                      : "var(--color-border)";
                  return (
                    <TableRow key={o.id} className={`${rowPad} ${selected.has(o.id) ? "bg-primary/5" : i % 2 ? "bg-muted/60" : ""}`}>
                      <TableCell>
                        {operate && (
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary"
                            checked={selected.has(o.id)}
                            onChange={() => toggle(o.id)}
                          />
                        )}
                      </TableCell>
                      {allOlts && (
                        <TableCell className="truncate">
                          <Badge variant="outline" className={oltTint(o.oltId)} title={o.oltName}>{o.oltName}</Badge>
                        </TableCell>
                      )}
                      <TableCell className="border-l-[3px]" style={{ borderLeftColor: borderColor }}>
                        <StatusBadge state={o.state} />
                      </TableCell>
                      <TableCell className="truncate font-mono text-xs text-foreground">
                        {o.serial || "–"} {isEponPort(o.ponPort) && <Badge variant="secondary">EPON</Badge>}
                      </TableCell>
                      <TableCell className="truncate font-semibold text-foreground" title={o.name ?? undefined}>{o.name || "–"}</TableCell>
                      <TableCell className="truncate font-mono text-xs text-muted-foreground" title={o.type ?? undefined}>{o.type || "–"}</TableCell>
                      <TableCell>
                        {onuConnectionKind(o.type) === "bridge" ? (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">Bridge</Badge>
                        ) : onuConnectionKind(o.type) === "route" ? (
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Route</Badge>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <SignalPill rx={o.onuRx} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.wanIp ? (
                          <div className="flex items-center gap-1.5">
                            <a href={`http://${o.wanIp}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" title="Hap panelin web të ONU-së">
                              {o.wanIp} ↗
                            </a>
                            <PingButton ip={o.wanIp} />
                          </div>
                        ) : onuConnectionKind(o.type) === "bridge" ? (
                          <WinboxButton onuId={o.id} mgmtIp={o.mgmtIp} winboxUrl={o.winboxUrl} mac={o.mac} onSaved={load} />
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ExpiryCell iso={o.expiration} />
                      </TableCell>
                      <TableCell className={`font-mono text-[11px] font-medium ${online ? "text-success" : "text-muted-foreground"}`}>
                        {o.onlineDuration || "–"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="sm" className="h-6 px-2.5 text-[11px]">
                            <Link href={`/onus/${o.id}`}>
                              <Eye className="mr-1 h-3.5 w-3.5" /> View
                            </Link>
                          </Button>
                          {operate && !isEponPort(o.ponPort) && (
                            <Button variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" title="Ndrysho PPPoE" onClick={() => { const oid = o.oltId ?? currentOlt?.id; if (oid) setPppoeTarget({ oltId: oid, ponPort: o.ponPort }); }}>
                              <Lock className="h-4 w-4" />
                            </Button>
                          )}
                          {operate && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" title="Më shumë">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => restartOne(o)}>
                                  <RotateCw className="h-4 w-4" /> Riniso ONU
                                </DropdownMenuItem>
                                {admin && !isEponPort(o.ponPort) && (
                                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(o)}>
                                    <Trash2 className="h-4 w-4" /> Fshi ONU
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {pppoeTarget && (
        <PppoeModal open oltId={pppoeTarget.oltId} ponPort={pppoeTarget.ponPort} onClose={() => setPppoeTarget(null)} onDone={load} />
      )}

      {deleteTarget && (
        <DeleteOnuDialog
          open
          onuId={deleteTarget.id}
          ponPort={deleteTarget.ponPort}
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
