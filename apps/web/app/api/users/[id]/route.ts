import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, Prisma } from "@oltflow/db";
import { userUpdateSchema } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";
import { resolveAppBaseUrl, sendWelcomeApprovedEmail } from "@/lib/mailer";

// Guards against locking everyone out: the system must always keep at least one admin.
async function wouldRemoveLastAdmin(targetId: number): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (target?.role !== "admin") return false;
  const admins = await prisma.user.count({ where: { role: "admin" } });
  return admins <= 1;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("users.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;
  const id = Number((await params).id);

  const parsed = userUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Të dhëna të pavlefshme" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Përdoruesi nuk u gjet" }, { status: 404 });

  // Don't let an admin demote themselves, and never demote the last admin.
  if (parsed.data.role && parsed.data.role !== "admin") {
    if (Number(session!.sub) === id) return NextResponse.json({ error: "Nuk mund ta heqësh rolin admin nga vetja" }, { status: 400 });
    if (await wouldRemoveLastAdmin(id)) return NextResponse.json({ error: "Duhet të mbetet të paktën një admin" }, { status: 400 });
  }

  const data: Prisma.UserUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.password !== undefined) data.passwordH = await bcrypt.hash(parsed.data.password, 10);
  if (parsed.data.telegramChatId !== undefined) data.telegramChatId = parsed.data.telegramChatId || null;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  // Approving a pending user: mark verified if somehow missing.
  if (parsed.data.status === "active" && !target.emailVerifiedAt) {
    data.emailVerifiedAt = new Date();
  }
  // `set` replaces the whole assignment. Promoting to admin clears any scope (admins are
  // never restricted); otherwise apply the provided list (empty = unrestricted).
  const effectiveRole = parsed.data.role ?? target.role;
  if (effectiveRole === "admin") {
    if (parsed.data.role === "admin") data.olts = { set: [] };
  } else if (parsed.data.oltIds !== undefined) {
    data.olts = { set: parsed.data.oltIds.map((oltId) => ({ id: oltId })) };
  }

  const user = await prisma.user.update({
    where: { id },
    data,
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

  // Welcome email when admin activates a previously-pending account.
  if (target.status === "pending" && parsed.data.status === "active") {
    const base = await resolveAppBaseUrl(request);
    void sendWelcomeApprovedEmail(user.email, user.name ?? user.email, `${base}/login`);
  }

  return NextResponse.json({
    user: {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("users.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;
  const id = Number((await params).id);

  if (Number(session!.sub) === id) return NextResponse.json({ error: "Nuk mund të fshish vetveten" }, { status: 400 });
  if (await wouldRemoveLastAdmin(id)) return NextResponse.json({ error: "Duhet të mbetet të paktën një admin" }, { status: 400 });

  await prisma.user.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
