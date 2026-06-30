import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);

  const [total, online, offline, criticalOnuIds, warningOnuIds] = await Promise.all([
    prisma.onu.count({ where: { oltId } }),
    prisma.onu.count({ where: { oltId, state: "working" } }),
    prisma.onu.count({ where: { oltId, state: { not: "working" } } }),
    prisma.signal.findMany({
      where: {
        signalLevel: "critical",
        recordedAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
        onu: { oltId },
      },
      select: { onuId: true },
      distinct: ["onuId"],
    }),
    prisma.signal.findMany({
      where: {
        signalLevel: "warning",
        recordedAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
        onu: { oltId },
      },
      select: { onuId: true },
      distinct: ["onuId"],
    }),
  ]);

  return NextResponse.json({
    total,
    online,
    offline,
    criticalSignal: criticalOnuIds.length,
    warningSignal: warningOnuIds.length,
  });
}
