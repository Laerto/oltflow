"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Search, Eye, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalPill } from "@/components/signal-pill";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useOlts } from "../providers";
import { api, type OnuRow } from "@/lib/api";
import { formatPonPort, isEponPort, onuConnectionKind } from "@oltflow/core";
import { PppoeModal } from "@/components/pppoe-modal";

type Filter = "online" | "offline" | "low-signal" | null;

const FILTER_LABELS: Record<Exclude<Filter, null>, string> = {
  online: "Online",
  offline: "Offline",
  "low-signal": "Sinjal i ulët",
};

function matchesFilter(o: OnuRow, filter: Filter): boolean {
  if (!filter) return true;
  if (filter === "online") return o.state === "working";
  if (filter === "offline") return o.state !== "working";
  if (filter === "low-signal") return o.onuRx !== null && o.onuRx !== undefined && o.onuRx < -25;
  return true;
}

export default function OnusPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground">Duke ngarkuar...</div>}>
      <OnusContent />
    </Suspense>
  );
}

function OnusContent() {
  const { currentOlt } = useOlts();
  const searchParams = useSearchParams();
  const filter = (searchParams.get("filter") as Filter) ?? null;
  const [onus, setOnus] = useState<OnuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pppoeTarget, setPppoeTarget] = useState<string | null>(null);

  async function load() {
    if (!currentOlt) return;
    setLoading(true);
    try {
      const { onus } = await api.onus(currentOlt.id);
      setOnus(onus);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOlt?.id]);

  const filtered = onus
    .filter((o) => matchesFilter(o, filter))
    .filter((o) => `${o.ponPort}${o.serial ?? ""}${o.name ?? ""}${o.type ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  if (!currentOlt) {
    return (
      <Card>
        <EmptyState>Zgjidh ose shto një OLT.</EmptyState>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">ONU-të e Konfiguruara</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {currentOlt.name} · {onus.length} ONU gjithsej
            {filter && (
              <>
                {" · filtër: "}
                <span className="font-semibold text-foreground">{FILTER_LABELS[filter]}</span>{" "}
                <Link href="/onus" className="text-primary hover:underline">
                  (hiq)
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kërko SN, port, emër..."
              className="w-60 pl-9"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Rifresko
          </Button>
        </div>
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
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase">Port</TableHead>
                <TableHead className="text-[10px] uppercase">Serial</TableHead>
                <TableHead className="text-[10px] uppercase">Emri</TableHead>
                <TableHead className="text-[10px] uppercase">Tipi</TableHead>
                <TableHead className="text-[10px] uppercase">State</TableHead>
                <TableHead className="text-[10px] uppercase">Sinjali</TableHead>
                <TableHead className="text-[10px] uppercase">IP (WAN)</TableHead>
                <TableHead className="text-[10px] uppercase">Online</TableHead>
                <TableHead className="text-[10px] uppercase">Veprime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs text-primary">
                    {formatPonPort(o.ponPort)} {isEponPort(o.ponPort) && <Badge variant="secondary">EPON</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{o.serial || "–"}</TableCell>
                  <TableCell className="font-medium">{o.name || "–"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary">{o.type || "–"}</Badge>
                      {onuConnectionKind(o.type) === "bridge" && <Badge variant="outline">Bridge</Badge>}
                      {onuConnectionKind(o.type) === "route" && <Badge variant="outline">Route</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge state={o.state} />
                  </TableCell>
                  <TableCell>
                    <SignalPill rx={o.onuRx} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {o.wanIp ? (
                      <a
                        href={`http://${o.wanIp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        title="Hap panelin web të ONU-së"
                      >
                        {o.wanIp} ↗
                      </a>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{o.onlineDuration || "–"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      <Button asChild size="sm" className="h-7 px-2 text-[11px]">
                        <Link href={`/onus/${o.id}`}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Detaje
                        </Link>
                      </Button>
                      {!isEponPort(o.ponPort) && (
                        <Button variant="secondary" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setPppoeTarget(o.ponPort)}>
                          <Lock className="mr-1 h-3.5 w-3.5" /> PPPoE
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pppoeTarget && (
        <PppoeModal open oltId={currentOlt.id} ponPort={pppoeTarget} onClose={() => setPppoeTarget(null)} onDone={load} />
      )}
    </div>
  );
}
