"use client";

import { classifySignal } from "@oltflow/core";

/** RX signal shown as an ascending 5-segment mini-bar + the dBm value. Bands come from the
 * single-source thresholds in @oltflow/core (good ≥ -25, warning -27..-25, critical < -27). */
export function SignalPill({ rx }: { rx: number | null | undefined }) {
  if (rx === null || rx === undefined) {
    return <span className="font-mono text-xs text-muted-foreground">N/A</span>;
  }
  const band = classifySignal(rx);
  const color =
    band === "good" ? "var(--color-success)" : band === "warning" ? "var(--color-warning)" : "var(--color-destructive)";
  const filled = band === "good" ? (rx >= -22 ? 5 : 4) : band === "warning" ? 3 : rx >= -29 ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-2" title={`${rx} dBm`}>
      <span className="flex items-end gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-1 rounded-sm"
            style={{ height: `${6 + i * 2}px`, background: i < filled ? color : "var(--color-border)" }}
          />
        ))}
      </span>
      <span className="font-mono text-xs font-semibold" style={{ color }}>
        {rx} dBm
      </span>
    </span>
  );
}
