import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES, TIER, isEponPort, renameOnuSchema } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess, guardTier } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

// Fixes a registration typo — pushes a new display name to the ONU on the OLT (GPON only).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const tierDenied = await guardTier(TIER.OPERATE);
  if (tierDenied) return tierDenied;
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
  const onu = await prisma.onu.findUnique({ where: { id: Number(id) } });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });
  if (isEponPort(onu.ponPort)) return NextResponse.json({ error: "Riemërtimi CLI mbështetet vetëm për GPON" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = renameOnuSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Emër jo i vlefshëm" }, { status: 400 });
  }

  const jobId = await enqueueJob(
    JOB_NAMES.setOnuName,
    { oltId: onu.oltId, onuId: onu.id, ponPort: onu.ponPort, name: parsed.data.name },
    { oltId: onu.oltId, ponPort: onu.ponPort }
  );
  return NextResponse.json({ jobId });
}
