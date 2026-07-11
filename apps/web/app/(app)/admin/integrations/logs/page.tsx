"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";

interface LogRow {
  id: string;
  eventType: string;
  channel: string;
  status: string;
  error: string | null;
  target: string | null;
  alarmKey: string | null;
  createdAt: string;
}

export default function NotificationLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminNotifyLogs({ status: status || undefined });
      setLogs(data.logs);
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Send className="h-4 w-4 text-primary" /> Delivery log
        </h2>
        <p className="text-xs text-muted-foreground">A doli njoftimi? Çdo dërgim ruhet këtu.</p>
      </div>

      <div className="flex gap-1.5">
        {["", "sent", "failed", "skipped"].map((s) => (
          <Button key={s || "all"} size="sm" variant={status === s ? "default" : "secondary"} onClick={() => setStatus(s)}>
            {s || "të gjitha"}
          </Button>
        ))}
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <Card className="overflow-hidden">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Koha</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Kanal</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Gabim</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    {new Date(l.createdAt).toLocaleString("sq-AL")}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{l.eventType}</td>
                  <td className="px-3 py-1.5">{l.channel}</td>
                  <td className="px-3 py-1.5">
                    <Badge
                      variant="outline"
                      className={
                        l.status === "sent"
                          ? "border-emerald-500/30 text-emerald-600"
                          : l.status === "failed"
                            ? "border-rose-500/30 text-rose-600"
                            : ""
                      }
                    >
                      {l.status}
                    </Badge>
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-1.5 font-mono text-[10px]">{l.target ?? "—"}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-rose-600" title={l.error ?? undefined}>
                    {l.error ?? "—"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Asnjë delivery ende
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
