import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);

  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [total, online, recentSignals, expiringList] = await Promise.all([
    prisma.onu.count({ where: { oltId } }),
    prisma.onu.count({ where: { oltId, state: "working" } }),
    // Both signal levels in one pass; distinct per ONU so an ONU logging several rows in
    // the window is counted once. Served by the new [signalLevel, recordedAt] index.
    prisma.signal.findMany({
      where: {
        signalLevel: { in: ["warning", "critical"] },
        recordedAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
        onu: { oltId },
      },
      select: { onuId: true, signalLevel: true },
      distinct: ["onuId", "signalLevel"],
    }),
    // Clients whose RADIUS subscription has expired or expires within 7 days — the
    // office works this list daily to call people in to pay. Soonest (most overdue) first.
    prisma.onu.findMany({
      where: { oltId, expiration: { not: null, lte: in7Days } },
      select: { id: true, name: true, ponPort: true, expiration: true, pppoeUser: true },
      orderBy: { expiration: "asc" },
      take: 60,
    }),
  ]);

  return NextResponse.json({
    total,
    online,
    offline: total - online,
    criticalSignal: recentSignals.filter((s) => s.signalLevel === "critical").length,
    warningSignal: recentSignals.filter((s) => s.signalLevel === "warning").length,
    expiring: expiringList.map((o) => ({
      id: o.id,
      name: o.name,
      ponPort: o.ponPort,
      expiration: o.expiration?.toISOString() ?? null,
      pppoeUser: o.pppoeUser,
    })),
  });
}
