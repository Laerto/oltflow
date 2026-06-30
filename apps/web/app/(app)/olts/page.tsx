"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, LayoutDashboard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useOlts } from "../providers";
import { api, ApiError, type OltSummary } from "@/lib/api";
import { EditOltModal } from "@/components/edit-olt-modal";

export default function OltsPage() {
  const { olts, refresh, setCurrentOltId } = useOlts();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<OltSummary | null>(null);

  async function remove(id: number, name: string) {
    if (!confirm(`Fshi OLT "${name}"? Kjo do fshijë gjithë ONU-të dhe historikun e sinjalit të lidhura.`)) return;
    setBusyId(id);
    setError(null);
    try {
      await api.deleteOlt(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gabim i papritur");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Menaxhimi i OLT-eve</h1>
      </div>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        {olts.length === 0 ? (
          <EmptyState>Asnjë OLT — kliko &ldquo;Shto OLT&rdquo; në menunë kryesore.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase">#</TableHead>
                  <TableHead className="text-[10px] uppercase">Emri</TableHead>
                  <TableHead className="text-[10px] uppercase">IP</TableHead>
                  <TableHead className="text-[10px] uppercase">Lokacioni</TableHead>
                  <TableHead className="text-[10px] uppercase">Status</TableHead>
                  <TableHead className="text-[10px] uppercase">ONU</TableHead>
                  <TableHead className="text-[10px] uppercase">Last Sync</TableHead>
                  <TableHead className="text-[10px] uppercase">Veprime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {olts.map((o, i) => (
                  <TableRow key={o.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-semibold">{o.name}</TableCell>
                    <TableCell className="font-mono text-xs text-primary">{o.ip}</TableCell>
                    <TableCell>{o.location || "–"}</TableCell>
                    <TableCell>
                      <StatusBadge state={o.status === "online" ? "working" : o.status === "offline" ? "offline" : null} />
                    </TableCell>
                    <TableCell>{o.total}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{o.lastSync ? new Date(o.lastSync).toLocaleString("sq-AL") : "–"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setCurrentOltId(o.id);
                            router.push("/");
                          }}
                        >
                          <LayoutDashboard className="mr-1 h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Dashboard</span>
                        </Button>
                        <Button variant="secondary" size="sm" className="h-7 w-7 p-0" onClick={() => setEditTarget(o)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 w-7 p-0" disabled={busyId === o.id} onClick={() => remove(o.id, o.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
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

      {editTarget && (
        <EditOltModal open onClose={() => setEditTarget(null)} olt={editTarget} onSaved={refresh} />
      )}
    </div>
  );
}
