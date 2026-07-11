import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { replaceOnuSchema, JOB_NAMES, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess, guardTier } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const tierDenied = await guardTier(TIER.ADMIN);
  if (tierDenied) return tierDenied;
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
  const onu = await prisma.onu.findUnique({ where: { id: Number(id) } });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = replaceOnuSchema.safeParse({ ...body, onuId: onu.id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }

  const jobId = await enqueueJob(
    JOB_NAMES.replaceOnu,
    { oltId: onu.oltId, onuId: onu.id, ponPort: onu.ponPort, onuSerial: parsed.data.onuSerial, onuType: parsed.data.onuType },
    { oltId: onu.oltId, ponPort: onu.ponPort }
  );
  return NextResponse.json({ jobId });
}
