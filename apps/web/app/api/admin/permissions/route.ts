import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  rolePermissionMatrix,
  ROLE_DEFAULT_PERMISSIONS,
} from "@oltflow/core";
import { requirePerm, invalidatePermissionCache } from "@/lib/authorize";

/** Catalogue + role defaults + all per-user overrides. */
export async function GET() {
  const denied = await requirePerm("permissions.manage");
  if ("error" in denied && denied.error) return denied.error;

  const [users, overrides] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true },
      orderBy: { email: "asc" },
    }),
    prisma.userPermission.findMany({
      select: { userId: true, perm: true, allow: true },
    }),
  ]);

  const byUser: Record<number, { perm: string; allow: boolean }[]> = {};
  for (const o of overrides) {
    (byUser[o.userId] ??= []).push({ perm: o.perm, allow: o.allow });
  }

  return NextResponse.json({
    catalogue: PERMISSIONS,
    groups: PERMISSION_GROUPS,
    roleDefaults: ROLE_DEFAULT_PERMISSIONS,
    roleMatrix: rolePermissionMatrix(),
    users: users.map((u) => ({
      ...u,
      overrides: byUser[u.id] ?? [],
    })),
  });
}

/** Set or clear a single per-user override. Body: { userId, perm, allow: boolean | null }
 *  allow=null clears the override (revert to role default). */
export async function PUT(request: Request) {
  const denied = await requirePerm("permissions.manage");
  if ("error" in denied && denied.error) return denied.error;
  const session = denied.session!;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.userId !== "number" || typeof body.perm !== "string") {
    return NextResponse.json({ error: "Të dhëna të pavlefshme" }, { status: 400 });
  }
  const { userId, perm } = body as { userId: number; perm: string; allow: boolean | null };
  const allow = body.allow as boolean | null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Përdoruesi nuk u gjet" }, { status: 404 });

  if (allow === null) {
    await prisma.userPermission.deleteMany({ where: { userId, perm } });
  } else {
    await prisma.userPermission.upsert({
      where: { userId_perm: { userId, perm } },
      create: { userId, perm, allow: Boolean(allow) },
      update: { allow: Boolean(allow) },
    });
  }

  invalidatePermissionCache(userId);

  await prisma.auditLog
    .create({
      data: {
        userId: Number(session.sub),
        action: "permission_override",
        result: "success",
        payload: { targetUserId: userId, perm, allow },
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
