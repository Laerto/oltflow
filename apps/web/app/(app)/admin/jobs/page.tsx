"use client";

import { useCallback, useEffect, useState } from "react";
import { ListTodo, RotateCcw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface JobRow {
  id: string;
  type: string;
  status: string;
  oltName: string | null;
  ponPort: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState({ waiting: 0, active: 0, delayed: 0, failed: 0 });
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminJobs({ status: status || undefined });
      setJobs(data.jobs);
      setByStatus(data.byStatus);
      setQueue(data.queue);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, [status]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  async function act(id: string, action: "retry" | "discard") {
    setBusy(id);
    try {
      await api.adminJobAction(id, action);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["waiting", "active", "delayed", "failed"] as const).map((k) => (
          <Card key={k} className="p-3 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">queue {k}</div>
            <div className="text-xl font-bold">{queue[k]}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["", "queued", "active", "done", "failed"].map((s) => (
          <Button
            key={s || "all"}
            size="sm"
            variant={status === s ? "default" : "secondary"}
            onClick={() => setStatus(s)}
          >
            {s || "të gjitha"}
            {s && byStatus[s] != null ? ` (${byStatus[s]})` : ""}
          </Button>
        ))}
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <Card className="overflow-hidden">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Tipi</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">OLT</th>
                <th className="px-3 py-2">Koha</th>
                <th className="px-3 py-2">Gabim</th>
                <th className="px-3 py-2 text-right">Veprime</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-border/50">
                  <td className="px-3 py-1.5 font-mono">{j.type}</td>
                  <td className="px-3 py-1.5">
                    <Badge
                      variant="outline"
                      className={
                        j.status === "done"
                          ? "border-emerald-500/30 text-emerald-600"
                          : j.status === "failed"
                            ? "border-rose-500/30 text-rose-600"
                            : j.status === "active"
                              ? "border-blue-500/30 text-blue-600"
                              : ""
                      }
                    >
                      {j.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5">{j.oltName ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    {new Date(j.createdAt).toLocaleString("sq-AL")}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-rose-600" title={j.error ?? undefined}>
                    {j.error ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">
                      {j.status === "failed" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2"
                          disabled={busy === j.id}
                          onClick={() => act(j.id, "retry")}
                          title="Retry"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(j.status === "failed" || j.status === "queued") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2"
                          disabled={busy === j.id}
                          onClick={() => act(j.id, "discard")}
                          title="Discard"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    <ListTodo className="mx-auto mb-1 h-5 w-5" /> Asnjë job
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
