import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  await requireUser();
  const url = new URL(request.url);
  const oltId = url.searchParams.get("oltId");

  const logs = await prisma.auditLog.findMany({
    where: oltId ? { oltId: Number(oltId) } : undefined,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id.toString(),
      action: l.action,
      oltId: l.oltId,
      ponPort: l.ponPort,
      result: l.result,
      createdAt: l.createdAt,
    })),
  });
}
