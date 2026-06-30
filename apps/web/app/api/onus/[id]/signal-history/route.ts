import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const onuId = Number(id);

  const signals = await prisma.signal.findMany({
    where: { onuId },
    orderBy: { recordedAt: "desc" },
    take: 50,
    select: { onuRx: true, oltRx: true, signalLevel: true, recordedAt: true },
  });

  return NextResponse.json({
    history: signals.map((s) => ({
      onuRx: s.onuRx,
      oltRx: s.oltRx,
      signalLevel: s.signalLevel,
      time: s.recordedAt,
    })),
  });
}
