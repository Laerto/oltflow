"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ScrollText, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface AuditRow {
  id: string;
  action: string;
  result: string | null;
  oltName: string | null;
  ponPort: string | null;
  userEmail: string | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.adminAudit({ q: q || undefined, action: action || undefined, result: result || undefined, limit: 150 });
      setLogs(data.logs);
      setNextCursor(data.nextCursor);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, [q, action, result]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.adminAudit({
        q: q || undefined,
        action: action || undefined,
        result: result || undefined,
        limit: 150,
        cursor: nextCursor,
      });
      setLogs((prev) => [...prev, ...data.logs]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  function exportCsv() {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (action) sp.set("action", action);
    if (result) sp.set("result", result);
    sp.set("format", "csv");
    sp.set("limit", "500");
    window.open(`/api/admin/audit?${sp}`, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kërko action / port…" className="h-8 pl-8 text-xs" />
        </div>
        <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="action" className="h-8 w-36 text-xs" />
        <Input value={result} onChange={(e) => setResult(e.target.value)} placeholder="result" className="h-8 w-28 text-xs" />
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Koha</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Rezultat</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">OLT</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr
                    key={l.id}
                    className={`cursor-pointer border-t border-border/50 hover:bg-muted/40 ${selected?.id === l.id ? "bg-primary/5" : ""}`}
                    onClick={() => setSelected(l)}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      {new Date(l.createdAt).toLocaleString("sq-AL")}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{l.action}</td>
                    <td className="px-3 py-1.5">
                      <Badge
                        variant="outline"
                        className={
                          l.result === "success"
                            ? "border-emerald-500/30 text-emerald-600"
                            : l.result === "error"
                              ? "border-rose-500/30 text-rose-600"
                              : ""
                        }
                      >
                        {l.result ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5">{l.userEmail ?? "—"}</td>
                    <td className="px-3 py-1.5">{l.oltName ?? "—"}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      <ScrollText className="mx-auto mb-1 h-5 w-5" /> Asnjë regjistër
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div className="flex justify-center border-t border-border/50 py-3">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Duke ngarkuar..." : `Ngarko më shumë (${logs.length})`}
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Payload</h3>
          {selected ? (
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">ID:</span> {selected.id}
              </div>
              <div>
                <span className="text-muted-foreground">Port:</span> {selected.ponPort ?? "—"}
              </div>
              <pre className="max-h-[400px] overflow-auto rounded-md bg-muted p-2 font-mono text-[10px]">
                {JSON.stringify(selected.payload, null, 2) ?? "null"}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Zgjidh një rresht për të parë payload-in.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
