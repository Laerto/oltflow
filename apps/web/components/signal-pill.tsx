"use client";

import { Activity } from "lucide-react";

export function SignalPill({ rx }: { rx: number | null | undefined }) {
  if (rx === null || rx === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" /> N/A
      </span>
    );
  }
  const level = rx >= -25 ? "good" : rx >= -27 ? "warn" : "crit";
  const styles =
    level === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : level === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
        : "border-rose-500/30 bg-rose-500/10 text-rose-700";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs font-semibold ${styles}`}>
      <Activity className="h-3.5 w-3.5" /> {rx} dBm
    </span>
  );
}
