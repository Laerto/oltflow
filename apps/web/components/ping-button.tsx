"use client";

import { useState } from "react";
import { Radio, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/** Small inline "Ping" control for an ONU's WAN IP — pings from the server and
 * shows alive (latency) / unreachable right next to the IP. */
export function PingButton({ ip }: { ip: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "down">("idle");
  const [ms, setMs] = useState<number | null>(null);

  async function doPing(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setState("loading");
    try {
      const r = await api.ping(ip);
      if (r.alive) {
        setMs(r.avgMs);
        setState("ok");
      } else {
        setState("down");
      }
    } catch {
      setState("down");
    }
  }

  const base = "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition";
  if (state === "ok") {
    return (
      <span className={`${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-700`} title={`Ping OK${ms !== null ? ` · ${ms} ms` : ""}`}>
        <Radio className="h-3 w-3" /> {ms !== null ? `${ms} ms` : "OK"}
      </span>
    );
  }
  if (state === "down") {
    return (
      <button onClick={doPing} className={`${base} border-rose-500/30 bg-rose-500/10 text-rose-700`} title="S'u arrit — kliko për të riprovuar">
        <Radio className="h-3 w-3" /> s&apos;arrihet
      </button>
    );
  }
  return (
    <button
      onClick={doPing}
      disabled={state === "loading"}
      className={`${base} border-border bg-muted text-muted-foreground hover:text-foreground`}
      title="Ping IP-në e ONU-së"
    >
      {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radio className="h-3 w-3" />} Ping
    </button>
  );
}
