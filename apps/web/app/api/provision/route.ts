import { NextResponse } from "next/server";
import { authorizeOnuSchema, JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/queue";

export async function POST(request: Request) {
  await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = authorizeOnuSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const input = parsed.data;
  const jobId = await enqueueJob(JOB_NAMES.provision, input, { oltId: input.oltId, ponPort: input.ponPort });
  return NextResponse.json({ jobId });
}
