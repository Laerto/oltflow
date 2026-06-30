import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);

  const [total, online, recentSignals] = await Promise.all([
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
  ]);

  return NextResponse.json({
    total,
    online,
    offline: total - online,
    criticalSignal: recentSignals.filter((s) => s.signalLevel === "critical").length,
    warningSignal: recentSignals.filter((s) => s.signalLevel === "warning").length,
  });
}
