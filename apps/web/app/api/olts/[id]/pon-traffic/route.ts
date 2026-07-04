import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { guardOltAccess } from "@/lib/olt-access";

// Per-PON-port throughput for the dashboard chart. Reads sample rows written by the
// worker's SNMP poll (sync/pon-traffic.ts) — no live device call here.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const denied = await guardOltAccess(oltId);
  if (denied) return denied;

  // Last 30 minutes of samples (worker polls every ~30s ⇒ ~60 points).
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const rows = await prisma.ponTraffic.findMany({
    where: { oltId, recordedAt: { gte: since } },
    select: { ponPort: true, downBps: true, upBps: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });

  if (rows.length === 0) {
    return NextResponse.json({ available: false, ports: [], series: [] });
  }

  // Aggregate series: sum every port sharing a poll timestamp (bucketed to the second).
  const buckets = new Map<number, { down: number; up: number }>();
  for (const r of rows) {
    const t = Math.round(r.recordedAt.getTime() / 1000) * 1000;
    const b = buckets.get(t) ?? { down: 0, up: 0 };
    b.down += r.downBps;
    b.up += r.upBps;
    buckets.set(t, b);
  }
  const series = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, downBps: v.down, upBps: v.up }));

  // Latest sample per port (most recent recordedAt wins) for the per-port bars.
  const latest = new Map<string, { downBps: number; upBps: number; at: number }>();
  for (const r of rows) {
    const prev = latest.get(r.ponPort);
    if (!prev || r.recordedAt.getTime() > prev.at) {
      latest.set(r.ponPort, { downBps: r.downBps, upBps: r.upBps, at: r.recordedAt.getTime() });
    }
  }
  const ports = [...latest.entries()]
    .map(([ponPort, v]) => ({ ponPort, downBps: v.downBps, upBps: v.upBps }))
    .sort((a, b) => b.downBps + b.upBps - (a.downBps + a.upBps));

  return NextResponse.json({ available: true, ports, series });
}
