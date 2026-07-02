"use client";

/** RX signal shown as an ascending 5-segment mini-bar + the dBm value.
 * Color bands: >= -20 good (green), -20..-25 warning (amber), < -25 critical (red). */
export function SignalPill({ rx }: { rx: number | null | undefined }) {
  if (rx === null || rx === undefined) {
    return <span className="font-mono text-xs text-muted-foreground">N/A</span>;
  }
  // Spec thresholds: >= -23 good (green), -23..-25 medium (orange), < -25 weak (red).
  const color =
    rx >= -23 ? "var(--color-success)" : rx >= -25 ? "var(--color-warning)" : "var(--color-destructive)";
  const filled = rx >= -23 ? 5 : rx >= -24 ? 4 : rx >= -25 ? 3 : rx >= -27 ? 2 : 1;
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
