export function stateBadgeColor(state: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (state === "working") return "default"; // maps to green via variant override
  if (!state) return "secondary";
  return "destructive";
}

export function stateLabel(state: string | null | undefined): string {
  if (state === "working") return "online";
  return state || "–";
}

export function signalLevel(rx: number): "good" | "warn" | "crit" {
  if (rx >= -25) return "good";
  if (rx >= -27) return "warn";
  return "crit";
}

export const statusColor = {
  good: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  crit: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};
