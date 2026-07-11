import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { guardOltAccess } from "@/lib/olt-access";

// Per-card CPU% + temperature for the "OLT health" panel. Reads snapshot rows written by the
// worker's SNMP poll (sync/olt-health.ts) — no live device call here.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const denied = await guardOltAccess(oltId);
  if (denied) return denied;

  // Last 30 minutes of snapshots (worker polls ~60s ⇒ ~30 points) for the trend line.
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const rows = await prisma.oltHealth.findMany({
    where: { oltId, recordedAt: { gte: since } },
    select: { slot: true, card: true, cpu: true, temp: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });

  if (rows.length === 0) {
    return NextResponse.json({ available: false, cards: [], series: [] });
  }

  // Latest snapshot per slot for the per-card list.
  const latest = new Map<number, { card: string; cpu: number; temp: number; at: number }>();
  for (const r of rows) {
    const prev = latest.get(r.slot);
    if (!prev || r.recordedAt.getTime() > prev.at) {
      latest.set(r.slot, { card: r.card, cpu: r.cpu, temp: r.temp, at: r.recordedAt.getTime() });
    }
  }
  const cards = [...latest.entries()]
    .map(([slot, v]) => ({ slot, card: v.card, cpu: v.cpu, temp: v.temp }))
    .sort((a, b) => a.slot - b.slot);

  // Trend series: the busiest card per poll timestamp (max CPU / max temp across cards), so
  // the sparkline tracks whatever board is under the most load without one line per slot.
  const buckets = new Map<number, { cpu: number; temp: number }>();
  for (const r of rows) {
    const t = Math.round(r.recordedAt.getTime() / 1000) * 1000;
    const b = buckets.get(t) ?? { cpu: 0, temp: 0 };
    b.cpu = Math.max(b.cpu, r.cpu);
    b.temp = Math.max(b.temp, r.temp);
    buckets.set(t, b);
  }
  const series = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, cpu: v.cpu, temp: v.temp }));

  // Headline figures. Averages ignore cards that report neither CPU nor temp (power cards),
  // so a chassis full of idle-reporting boards doesn't drag the average to ~0.
  const active = cards.filter((c) => c.cpu > 0 || c.temp > 0);
  const avgCpu = active.length ? active.reduce((s, c) => s + c.cpu, 0) / active.length : 0;
  const maxCpu = Math.max(0, ...cards.map((c) => c.cpu));
  const maxTemp = Math.max(0, ...cards.map((c) => c.temp));

  return NextResponse.json({ available: true, cards, series, maxCpu, maxTemp, avgCpu });
}
