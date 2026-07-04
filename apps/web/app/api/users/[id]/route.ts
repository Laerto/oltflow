import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, Prisma } from "@oltflow/db";
import { userUpdateSchema, roleRank, TIER } from "@oltflow/core";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (roleRank(session.role) < TIER.ADMIN) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

// Guards against locking everyone out: the system must always keep at least one admin.
async function wouldRemoveLastAdmin(targetId: number): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (target?.role !== "admin") return false;
  const admins = await prisma.user.count({ where: { role: "admin" } });
  return admins <= 1;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;
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
    select: { id: true, email: true, name: true, role: true, createdAt: true, telegramChatId: true, olts: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ user });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const id = Number((await params).id);

  if (Number(session!.sub) === id) return NextResponse.json({ error: "Nuk mund të fshish vetveten" }, { status: 400 });
  if (await wouldRemoveLastAdmin(id)) return NextResponse.json({ error: "Duhet të mbetet të paktën një admin" }, { status: 400 });

  await prisma.user.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
