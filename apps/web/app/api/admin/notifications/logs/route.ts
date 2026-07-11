import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";

export async function GET(request: Request) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const channel = url.searchParams.get("channel") || undefined;
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 80)));

  const logs = await prisma.notificationLog.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id.toString(),
      ruleId: l.ruleId,
      eventType: l.eventType,
      channel: l.channel,
      status: l.status,
      error: l.error,
      target: l.target,
      alarmKey: l.alarmKey,
      oltId: l.oltId,
      onuId: l.onuId,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
