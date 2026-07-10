import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES, isEponPort } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
  const onu = await prisma.onu.findUnique({ where: { id: Number(id) } });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });

  // Refresh-i (getOnuDetail) është vetëm GPON — parserimi i PON Port-it e refuzon EPON-in.
  // Mos radhit një job të dënuar që do mbushte feed-in me dështime "Format i pavlefshëm".
  if (isEponPort(onu.ponPort)) {
    return NextResponse.json({ jobId: null, unsupported: true, reason: "Rifreskimi CLI nuk mbështetet ende për EPON" });
  }

  const jobId = await enqueueJob(
    JOB_NAMES.refreshOnu,
    { oltId: onu.oltId, onuId: onu.id, ponPort: onu.ponPort },
    { oltId: onu.oltId, ponPort: onu.ponPort }
  );
  return NextResponse.json({ jobId });
}
