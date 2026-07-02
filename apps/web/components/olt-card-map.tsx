"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type OltCard } from "@/lib/api";

/** Per-port status color: green = all online, amber = partially online,
 * red = ONUs present but all down, muted = empty port. */
function portClass(total: number, online: number): string {
  if (total === 0) return "border-border bg-muted/40 text-muted-foreground";
  if (online === total) return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700";
  if (online === 0) return "border-rose-500/40 bg-rose-500/15 text-rose-700";
  return "border-amber-500/40 bg-amber-500/15 text-amber-700";
}

export function OltCardMap({ oltId }: { oltId: number }) {
  const [cards, setCards] = useState<OltCard[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { cards } = await api.oltPorts(oltId);
      setCards(cards);
    } catch {
      setCards([]);
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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="h-4 w-4 text-primary" /> Harta e OLT-së — porta &amp; karta
        </CardTitle>
        <div className="flex items-center gap-3">
          <Legend />
          <button onClick={load} disabled={loading} className="text-muted-foreground transition hover:text-foreground" title="Rifresko">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cards === null ? (
          <Skeleton className="h-24 w-full" />
        ) : cards.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nuk ka karta të konfiguruara për këtë OLT.</div>
        ) : (
          cards.map((c) => <CardRow key={`${c.kind}-${c.slot}`} card={c} />)
        )}
      </CardContent>
    </Card>
  );
}

function CardRow({ card }: { card: OltCard }) {
  const total = card.ports.reduce((s, p) => s + p.total, 0);
  const online = card.ports.reduce((s, p) => s + p.online, 0);
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-3 py-2 text-white">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded bg-emerald-500 text-xs font-bold text-white">{card.slot}</span>
          <span className="text-sm font-semibold tracking-wide">{card.card}</span>
          <span className="text-[11px] uppercase text-slate-400">{card.kind}</span>
        </div>
        <div className="text-[11px] text-slate-300">
          <span className="font-semibold text-white">{total}</span> ONU · <span className="text-emerald-400">{online} online</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-2.5 sm:grid-cols-8">
        {card.ports.map((p) => {
          const inner = (
            <div className={`flex h-11 flex-col items-center justify-center rounded-md border text-center transition ${portClass(p.total, p.online)} ${p.total ? "hover:brightness-95" : ""}`}>
              <span className="text-[9px] font-medium opacity-70">P{p.port}</span>
              <span className="text-sm font-bold leading-none">{p.total || "–"}</span>
            </div>
          );
          if (!p.total) return <div key={p.port} title={`Port ${card.slot}/${p.port} · bosh`}>{inner}</div>;
          // Precise substring match against ponPort (…/<slot>/<port>:<id>) on the ONU list.
          const q = encodeURIComponent(`${card.slot}/${p.port}:`);
          return (
            <Link key={p.port} href={`/onus?q=${q}`} title={`Port ${card.slot}/${p.port} · ${p.total} ONU · ${p.online} online`}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["bg-emerald-500", "online"],
    ["bg-amber-500", "pjesërisht"],
    ["bg-rose-500", "offline"],
    ["bg-muted", "bosh"],
  ];
  return (
    <div className="hidden items-center gap-2.5 text-[10px] text-muted-foreground sm:flex">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ${c}`} /> {l}
        </span>
      ))}
    </div>
  );
}
