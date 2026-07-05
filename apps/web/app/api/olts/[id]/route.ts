import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { updateOltSchema, encryptSecret } from "@oltflow/core";
import { requireUser } from "@/lib/auth";

const OLT_CRED_KEY = process.env.OLT_CRED_KEY ?? "";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const olt = await prisma.olt.findUnique({ where: { id: oltId } });
  if (!olt) return NextResponse.json({ error: "OLT nuk u gjet" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateOltSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const input = parsed.data;

  const updated = await prisma.olt.update({
    where: { id: oltId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.ip !== undefined && { ip: input.ip }),
      ...(input.port !== undefined && { port: input.port }),
      ...(input.protocol !== undefined && { protocol: input.protocol }),
      ...(input.username !== undefined && { username: input.username }),
      ...(input.password !== undefined && { passwordEnc: encryptSecret(input.password, OLT_CRED_KEY) }),
      ...(input.enablePassword !== undefined && {
        enablePasswordEnc: input.enablePassword ? encryptSecret(input.enablePassword, OLT_CRED_KEY) : null,
      }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.model !== undefined && { model: input.model }),
      ...(input.slots !== undefined && { slots: input.slots }),
      ...(input.eponSlots !== undefined && { eponSlots: input.eponSlots }),
      ...(input.snmpCommunity !== undefined && { snmpCommunity: input.snmpCommunity || null }),
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "update_olt",
      oltId: updated.id,
      result: "success",
      userId: Number(user.sub),
      payload: { name: updated.name, slots: updated.slots },
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const olt = await prisma.olt.findUnique({ where: { id: oltId } });
  if (!olt) return NextResponse.json({ error: "OLT nuk u gjet" }, { status: 404 });

  await prisma.olt.delete({ where: { id: oltId } });
  await prisma.auditLog.create({
    data: { action: "delete_olt", oltId: null, result: "success", userId: Number(user.sub), payload: { name: olt.name, ip: olt.ip } },
  });
  return NextResponse.json({ ok: true });
}
