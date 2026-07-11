import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@oltflow/db";
import { userCreateSchema } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";

export async function GET() {
  const auth = await requirePerm("users.manage");
  if ("error" in auth) return auth.error;
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      telegramChatId: true,
      olts: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requirePerm("users.manage");
  if ("error" in auth) return auth.error;

  const parsed = userCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Të dhëna të pavlefshme" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "Ky email ekziston tashmë" }, { status: 409 });
  }

  const passwordH = await bcrypt.hash(parsed.data.password, 10);
  // Scope applies to support/viewer only; admins are always unrestricted so we never
  // persist an OLT list for them (avoids a stale scope if they're later demoted).
  const oltIds = parsed.data.role === "admin" ? [] : parsed.data.oltIds ?? [];
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name ?? null,
      passwordH,
      role: parsed.data.role,
      status: "active",
      emailVerifiedAt: new Date(), // admin-created accounts skip email confirm
      telegramChatId: parsed.data.telegramChatId || null,
      olts: oltIds.length ? { connect: oltIds.map((id) => ({ id })) } : undefined,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      telegramChatId: true,
      olts: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({
    user: {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
  });
}
