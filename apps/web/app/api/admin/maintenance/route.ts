import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";

export async function GET() {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;

  const now = new Date();
  const windows = await prisma.maintenanceWindow.findMany({
    orderBy: { startsAt: "desc" },
    take: 50,
    include: { olt: { select: { name: true } } },
  });

  return NextResponse.json({
    windows: windows.map((w) => ({
      id: w.id,
      name: w.name,
      oltId: w.oltId,
      oltName: w.olt?.name ?? null,
      startsAt: w.startsAt.toISOString(),
      endsAt: w.endsAt.toISOString(),
      reason: w.reason,
      active: w.startsAt <= now && w.endsAt >= now,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.startsAt || !body?.endsAt) {
    return NextResponse.json({ error: "name, startsAt, endsAt required" }, { status: 400 });
  }

  const w = await prisma.maintenanceWindow.create({
    data: {
      name: String(body.name),
      oltId: body.oltId != null ? Number(body.oltId) : null,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      reason: body.reason ?? null,
      createdById: Number(session.sub),
    },
  });
  return NextResponse.json({ window: w });
}

export async function DELETE(request: Request) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.maintenanceWindow.delete({ where: { id: Number(body.id) } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
