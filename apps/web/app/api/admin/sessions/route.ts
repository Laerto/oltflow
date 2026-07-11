import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";
import { revokeSession, revokeAllUserSessions } from "@/lib/auth";

export async function GET() {
  const denied = await requirePerm("sessions.manage");
  if ("error" in denied && denied.error) return denied.error;

  const sessions = await prisma.session.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      email: s.user.email,
      name: s.user.name,
      role: s.user.role,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      revoked: Boolean(s.revokedAt),
      revokedAt: s.revokedAt?.toISOString() ?? null,
    })),
  });
}

/** Body: { sessionId } | { userId, all: true } */
export async function DELETE(request: Request) {
  const denied = await requirePerm("sessions.manage");
  if ("error" in denied && denied.error) return denied.error;
  const session = denied.session!;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Të dhëna të pavlefshme" }, { status: 400 });

  if (body.all && typeof body.userId === "number") {
    const n = await revokeAllUserSessions(body.userId);
    await prisma.auditLog
      .create({
        data: {
          userId: Number(session.sub),
          action: "sessions_revoke_all",
          result: "success",
          payload: { targetUserId: body.userId, count: n },
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true, revoked: n });
  }

  if (typeof body.sessionId === "string") {
    const ok = await revokeSession(body.sessionId);
    await prisma.auditLog
      .create({
        data: {
          userId: Number(session.sub),
          action: "session_revoke",
          result: "success",
          payload: { sessionId: body.sessionId },
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true, revoked: ok ? 1 : 0 });
  }

  return NextResponse.json({ error: "sessionId ose userId+all kërkohet" }, { status: 400 });
}
