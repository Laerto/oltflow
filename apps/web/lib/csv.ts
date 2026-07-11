/** RFC-4180 CSV helpers shared by all table/report exports. */

export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(",");
}

/** Filename-safe UTC timestamp, e.g. 20260709-1432. */
export function csvStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  );
}
