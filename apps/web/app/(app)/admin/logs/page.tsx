"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

interface LogLine {
  level?: string;
  msg?: string;
  time?: string;
  [k: string]: unknown;
}

const LEVEL_CLS: Record<string, string> = {
  error: "text-rose-600",
  warn: "text-amber-600",
  info: "text-foreground",
  debug: "text-muted-foreground",
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [level, setLevel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminLogs({ level: level || undefined, limit: 200 });
      setLogs(data.logs);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gabim");
    }
  }, [level]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["", "error", "warn", "info", "debug"].map((l) => (
          <Button key={l || "all"} size="sm" variant={level === l ? "default" : "secondary"} onClick={() => setLevel(l)}>
            {l || "të gjitha"}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Rifresko
        </Button>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <Card className="overflow-hidden">
        <div className="max-h-[640px] overflow-auto bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <FileText className="mx-auto mb-2 h-5 w-5" />
              Asnjë log në ring buffer. Worker-i do të mbushë buffer-in sapo të shkruajë logje të reja.
            </div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="border-b border-white/5 py-0.5">
                <span className="text-slate-500">{l.time ?? ""}</span>{" "}
                <span className={LEVEL_CLS[l.level ?? "info"] ?? ""}>[{l.level ?? "?"}]</span>{" "}
                <span>{l.msg ?? JSON.stringify(l)}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
