import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";

/**
 * Ack or silence a persisted alarm.
 * Body: { action: "ack" | "unack" | "silence", minutes?: number }
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await requireUser();
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const body = await request.json().catch(() => null);
  const action = body?.action as string | undefined;
  if (!action || !["ack", "unack", "silence"].includes(action)) {
    return NextResponse.json({ error: "action: ack | unack | silence" }, { status: 400 });
  }

  const alarm = await prisma.alarm.findUnique({ where: { key } });
  if (!alarm || alarm.clearedAt) {
    return NextResponse.json({ error: "Alarm nuk u gjet ose është mbyllur" }, { status: 404 });
  }

  const allowed = await allowedOltIds(session);
  if (allowed !== "all" && alarm.oltId != null && !allowed.includes(alarm.oltId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (action === "ack") {
    await prisma.alarm.update({
      where: { key },
      data: { ackedAt: new Date(), ackedById: Number(session.sub) },
    });
  } else if (action === "unack") {
    await prisma.alarm.update({
      where: { key },
      data: { ackedAt: null, ackedById: null },
    });
  } else if (action === "silence") {
    const minutes = Math.min(24 * 60, Math.max(5, Number(body.minutes ?? 60)));
    await prisma.alarm.update({
      where: { key },
      data: { silencedUntil: new Date(Date.now() + minutes * 60_000) },
    });
  }

  return NextResponse.json({ ok: true });
}
