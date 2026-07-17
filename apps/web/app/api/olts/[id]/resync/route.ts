import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOltAccess } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

// "Resync now" — forces a full immediate sweep (state+signal+detail) of this OLT, so ONUs
// added/changed from a parallel tool (NetNumen) show up without waiting for the ~15-min cycle.
// Read-only against the device; the worker holds the per-OLT lock as an interactive command.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const denied = await guardOltAccess(oltId);
  if (denied) return denied;

  const olt = await prisma.olt.findUnique({ where: { id: oltId }, select: { id: true } });
  if (!olt) return NextResponse.json({ error: "OLT nuk u gjet" }, { status: 404 });

  const jobId = await enqueueJob(JOB_NAMES.resyncOlt, { oltId }, { oltId });
  return NextResponse.json({ jobId });
}
