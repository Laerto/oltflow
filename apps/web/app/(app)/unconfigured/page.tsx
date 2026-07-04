"use client";

import { useCallback, useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { useOlts } from "../providers";
import { api, type UncfgOnu } from "@/lib/api";
import { formatPonPort, isEponPort } from "@oltflow/core";
import { ProvisionModal } from "@/components/provision-modal";

const EPON_BADGE = "border-violet-500/30 bg-violet-500/10 text-violet-600";
const EPON_HINT = "ONU EPON — autorizohet nga CLI e OLT-së (paneli s'ka ende rrugë shkrimi për EPON)";

export default function UnconfiguredPage() {
  const { currentOlt, allOlts } = useOlts();
  const [onus, setOnus] = useState<UncfgOnu[]>([]);
  const [target, setTarget] = useState<UncfgOnu | null>(null);

  // Reads the persisted unconfigured set, kept continuously fresh by the worker's
  // inventory sync — no manual scan, no device round-trip on the request path.
  const load = useCallback(async () => {
    if (!currentOlt) return;
    try {
      const { onus } = await api.unconfigured(currentOlt.id);
      setOnus(onus);
    } catch {
      // keep last known list on transient errors
    }
  }, [currentOlt]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  if (!currentOlt) {
    return (
      <Card>
        <EmptyState>{allOlts ? "Autorizimi bëhet për një OLT — zgjidh një OLT specifik lart." : "Zgjidh ose shto një OLT."}</EmptyState>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Waiting Authorization</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            ONU të paautorizuara — {currentOlt.name} · {onus.length} në pritje · përditësohet automatikisht
          </p>
        </div>
      </div>

      <Card>
        {onus.length === 0 ? (
          <EmptyState>Asnjë ONU në pritje për autorizim</EmptyState>
        ) : (
          <>
          {/* Mobile: stacked rows with a big Autorizo button */}
          <div className="space-y-2.5 p-3 md:hidden">
            {onus.map((o) => (
              <div key={o.ponPort} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-sm">
                    {o.serial}
                    {isEponPort(o.ponPort) && <Badge variant="outline" className={EPON_BADGE}>EPON</Badge>}
                  </span>
                  <Badge variant="secondary">{o.state}</Badge>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{formatPonPort(o.ponPort)}</div>
                {isEponPort(o.ponPort) ? (
                  <div className="mt-3 rounded-md bg-muted px-2 py-2 text-[11px] text-muted-foreground">{EPON_HINT}</div>
                ) : (
                  <Button size="sm" className="mt-3 w-full" onClick={() => setTarget(o)}>
                    <Zap className="mr-1 h-4 w-4" /> Autorizo
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase">Serial Number</TableHead>
                  <TableHead className="text-[10px] uppercase">PON Port</TableHead>
                  <TableHead className="text-[10px] uppercase">Detected</TableHead>
                  <TableHead className="text-[10px] uppercase">Veprime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {onus.map((o) => (
                  <TableRow key={o.ponPort}>
                    <TableCell className="font-mono text-xs">
                      <span className="flex items-center gap-1.5">
                        {o.serial}
                        {isEponPort(o.ponPort) && <Badge variant="outline" className={EPON_BADGE}>EPON</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{formatPonPort(o.ponPort)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{o.state}</Badge>
                    </TableCell>
                    <TableCell>
                      {/* GPON: "Autorizo" opens the provision modal (Autorizo + PPPoE in one
                          pass). EPON has no write-path yet → authorize on the OLT CLI. */}
                      {isEponPort(o.ponPort) ? (
                        <span className="text-[11px] text-muted-foreground" title={EPON_HINT}>Autorizo në CLI</span>
                      ) : (
                        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setTarget(o)}>
                          <Zap className="mr-1 h-3.5 w-3.5" /> Autorizo
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </Card>

      {target && (
        <ProvisionModal
          open
          onClose={() => setTarget(null)}
          oltId={currentOlt.id}
          serial={target.serial}
          ponPort={target.ponPort}
          onDone={load}
        />
      )}
    </div>
  );
}
