"use client";

import { Globe } from "lucide-react";

/** SmartOLT-style status: a green globe when the ONU is online, a black globe when
 * it's offline (any non-working state), and a muted globe when the state is unknown. */
export function StatusBadge({ state }: { state: string | null | undefined }) {
  const online = state === "working";
  const cls = online
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
    : state
      ? "border-slate-800 bg-slate-900 text-white"
      : "border-border bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <Globe className="h-3.5 w-3.5" /> {online ? "online" : state || "–"}
    </span>
  );
}
