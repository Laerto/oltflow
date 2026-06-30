import { NextResponse } from "next/server";
import { JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/queue";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const jobId = await enqueueJob(JOB_NAMES.scanUnconfigured, { oltId }, { oltId });
  return NextResponse.json({ jobId });
}
