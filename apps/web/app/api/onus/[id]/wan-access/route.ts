import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES, isEponPort } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/queue";

// Enables WAN-side web access to the ONU's own management UI (security-mgmt WAN rules).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const onu = await prisma.onu.findUnique({ where: { id: Number(id) } });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });
  if (isEponPort(onu.ponPort)) {
    return NextResponse.json({ error: "Nuk mbështetet për ONU EPON" }, { status: 400 });
  }

  const jobId = await enqueueJob(
    JOB_NAMES.enableWanAccess,
    { oltId: onu.oltId, onuId: onu.id, ponPort: onu.ponPort },
    { oltId: onu.oltId, ponPort: onu.ponPort }
  );
  return NextResponse.json({ jobId });
}
