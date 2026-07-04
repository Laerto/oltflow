"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wrench, Play, CheckCircle2, ShieldCheck, RotateCcw, Eye, Clock, ArrowRight } from "lucide-react";
import {
  TICKET_STATUS_LABELS,
  TICKET_CATEGORY_LABELS,
  allowedActions,
  classifySignal,
  type TicketAction,
} from "@oltflow/core";
import { api, ApiError, type TicketRow } from "@/lib/api";
import { useMe } from "@/app/(app)/providers";
import { can } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColor: Record<string, string> = {
  open: "border-slate-400/30 bg-slate-400/10 text-slate-500",
  assigned: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  in_progress: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  resolved: "border-violet-500/30 bg-violet-500/10 text-violet-600",
  verified: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  reopened: "border-rose-500/30 bg-rose-500/10 text-rose-600",
};
const actionMeta: Record<TicketAction, { label: string; icon: typeof Play; cls: string }> = {
  start: { label: "Fillo riparimin", icon: Play, cls: "bg-amber-500 text-white hover:bg-amber-600" },
  resolve: { label: "Përfundova", icon: CheckCircle2, cls: "bg-violet-600 text-white hover:bg-violet-700" },
  verify: { label: "Verifiko", icon: ShieldCheck, cls: "bg-emerald-600 text-white hover:bg-emerald-700" },
  reopen: { label: "Rihap", icon: RotateCcw, cls: "" },
};

function fmtDuration(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 0) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function SignalTag({ rx }: { rx: number | null }) {
  if (rx == null) return <span className="text-muted-foreground">–</span>;
  const b = classifySignal(rx);
  const c = b === "good" ? "text-emerald-600" : b === "warning" ? "text-amber-600" : "text-rose-600";
  return <span className={`font-mono font-semibold ${c}`}>{rx} dBm</span>;
}

export default function TicketsPage() {
  const me = useMe();
  const office = can.operate(me?.role);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [technicians, setTechnicians] = useState<{ id: number; name: string | null; email: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "all" | "verified">("open");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { tickets } = await api.listTickets(statusFilter);
      setTickets(tickets);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim gjatë ngarkimit" });
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
    if (office) api.listTechnicians().then((r) => setTechnicians(r.technicians)).catch(() => {});
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load, office]);

  async function doAction(t: TicketRow, action: TicketAction) {
    let note: string | undefined;
    if (action === "resolve") {
      const n = window.prompt("Shënim riparimi (çfarë u bë):", "");
      if (n === null) return;
      note = n.trim() || undefined;
    }
    setBusy(t.id);
    try {
      await api.ticketAction(t.id, action, note);
      setMsg({ kind: "ok", text: `Tiketi #${t.id}: ${actionMeta[action].label}` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    } finally {
      setBusy(null);
    }
  }

  async function doAssign(t: TicketRow, techId: string) {
    setBusy(t.id);
    try {
      await api.assignTicket(t.id, techId === "none" ? null : Number(techId));
      setMsg({ kind: "ok", text: `Tiketi #${t.id} u caktua` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Gabim" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <Wrench className="h-5 w-5 text-amber-500" /> Defektet
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {office ? "Tiketat e riparimit — cakto teknik, ndiq riparimin, verifiko." : "Tiketat e caktuara për ty."} · {tickets.length}
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["open", "all", "verified"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                statusFilter === s ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "open" ? "Aktive" : s === "all" ? "Të gjitha" : "Verifikuar"}
            </button>
          ))}
        </div>
      </div>

      {msg && <Alert variant={msg.kind === "err" ? "destructive" : "default"} className="mb-4">{msg.text}</Alert>}

      {tickets.length === 0 ? (
        <Card><EmptyState>Asnjë tiket {statusFilter === "open" ? "aktiv" : ""}</EmptyState></Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const actions = allowedActions(t.status);
            const repair = fmtDuration(t.startedAt, t.resolvedAt);
            return (
              <Card key={t.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={statusColor[t.status] ?? ""}>{TICKET_STATUS_LABELS[t.status as keyof typeof TICKET_STATUS_LABELS] ?? t.status}</Badge>
                      <span className="text-[11px] text-muted-foreground">#{t.id} · {TICKET_CATEGORY_LABELS[t.category as keyof typeof TICKET_CATEGORY_LABELS] ?? t.category}</span>
                    </div>
                    <div className="mt-1 font-semibold text-foreground">{t.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      <Link href={`/onus/${t.onu.id}`} className="text-primary hover:underline">{t.onu.name || t.onu.ponPort}</Link>
                      {" · "}{t.olt.name}
                      {t.openedBy && <> · hapur nga {t.openedBy.name || t.openedBy.email}</>}
                      {" · "}{new Date(t.openedAt).toLocaleString("sq-AL")}
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                    <Link href={`/onus/${t.onu.id}`}><Eye className="mr-1 h-3.5 w-3.5" /> ONU</Link>
                  </Button>
                </div>

                {/* Signal before → after + repair time */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Sinjali:</span>
                    <SignalTag rx={t.rxAtOpen} />
                    {t.rxAtVerify != null && <><ArrowRight className="h-3 w-3 text-muted-foreground" /> <SignalTag rx={t.rxAtVerify} /></>}
                  </span>
                  {repair && <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Riparim: <b className="text-foreground">{repair}</b></span>}
                  {t.assignedTo && <span className="text-muted-foreground">Teknik: <b className="text-foreground">{t.assignedTo.name || t.assignedTo.email}</b></span>}
                </div>

                {t.resolutionNote && <div className="mt-2 rounded-md bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">🛠 {t.resolutionNote}</div>}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {office && (
                    <Select value={t.assignedToId ? String(t.assignedToId) : "none"} onValueChange={(v) => doAssign(t, v)} disabled={busy === t.id}>
                      <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Cakto teknik" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— pa teknik —</SelectItem>
                        {technicians.map((tech) => <SelectItem key={tech.id} value={String(tech.id)}>{tech.name || tech.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {actions.map((a) => {
                    const m = actionMeta[a];
                    const Icon = m.icon;
                    // verify/reopen are office-only.
                    if ((a === "verify" || a === "reopen") && !office) return null;
                    return (
                      <Button key={a} size="sm" className={m.cls} variant={m.cls ? "default" : "outline"} disabled={busy === t.id} onClick={() => doAction(t, a)}>
                        <Icon className="mr-1 h-4 w-4" /> {m.label}
                      </Button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
