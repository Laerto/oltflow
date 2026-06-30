"use client";

import { useState } from "react";
import { Search, Zap, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { api, pollJob, ApiError, type UncfgOnu } from "@/lib/api";
import { ProvisionModal } from "@/components/provision-modal";
import { PppoeModal } from "@/components/pppoe-modal";

export default function UnconfiguredPage() {
  const { currentOlt } = useOlts();
  const [onus, setOnus] = useState<UncfgOnu[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<UncfgOnu | null>(null);
  const [pppoeTarget, setPppoeTarget] = useState<string | null>(null);

  async function scan() {
    if (!currentOlt) return;
    setLoading(true);
    setError(null);
    try {
      const { jobId } = await api.scanUnconfigured(currentOlt.id);
      const job = await pollJob(jobId, { timeoutMs: 30000 });
      if (job.status === "failed") throw new Error(job.error ?? "Skanimi dështoi");
      const output = job.output as { onus: UncfgOnu[] };
      setOnus(output.onus ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : "Gabim i papritur"
      );
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="text-xl font-bold tracking-tight text-foreground">Waiting Authorization</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">ONU të paautorizuara — {currentOlt.name}</p>
        </div>
        <Button onClick={scan} disabled={loading} size="sm">
          {loading ? <Search className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />} Skano
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        {onus.length === 0 ? (
          <EmptyState>Kliko &ldquo;Skano&rdquo; për të gjetur ONU të paautorizuara</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
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
                    <TableCell className="font-mono text-xs">{o.serial}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{o.ponPort.replace("gpon-onu_", "")}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{o.state}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setTarget(o)}>
                          <Zap className="mr-1 h-3.5 w-3.5" /> Autorizo
                        </Button>
                        <Button variant="secondary" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setPppoeTarget(o.ponPort)}>
                          <Lock className="mr-1 h-3.5 w-3.5" /> PPPoE
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {target && (
        <ProvisionModal
          open
          onClose={() => setTarget(null)}
          oltId={currentOlt.id}
          serial={target.serial}
          ponPort={target.ponPort}
          onDone={scan}
        />
      )}
      {pppoeTarget && (
        <PppoeModal open oltId={currentOlt.id} ponPort={pppoeTarget} onClose={() => setPppoeTarget(null)} />
      )}
    </div>
  );
}
