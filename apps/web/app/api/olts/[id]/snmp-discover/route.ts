import { NextResponse } from "next/server";
import { JOB_NAMES, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardTier } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const tierDenied = await guardTier(TIER.ADMIN);
  if (tierDenied) return tierDenied;
  const { id } = await params;
  const oltId = Number(id);
  const jobId = await enqueueJob(JOB_NAMES.snmpDiscover, { oltId }, { oltId });
  return NextResponse.json({ jobId });
}
