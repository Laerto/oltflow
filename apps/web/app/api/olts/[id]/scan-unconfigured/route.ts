import { NextResponse } from "next/server";
import { JOB_NAMES, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOltAccess, guardTier } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const tierDenied = await guardTier(TIER.OPERATE);
  if (tierDenied) return tierDenied;
  const { id } = await params;
  const oltId = Number(id);
  const denied = await guardOltAccess(oltId);
  if (denied) return denied;
  const jobId = await enqueueJob(JOB_NAMES.scanUnconfigured, { oltId }, { oltId });
  return NextResponse.json({ jobId });
}
