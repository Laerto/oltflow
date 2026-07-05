import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { updateSplitterSchema } from "@oltflow/core";
import { requireUser } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const parsed = updateSplitterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Të dhëna jo të vlefshme" }, { status: 400 });
  const splitter = await prisma.splitter.update({ where: { id: Number(id) }, data: parsed.data });
  return NextResponse.json({ splitter });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  await prisma.splitter.delete({ where: { id: Number(id) } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
