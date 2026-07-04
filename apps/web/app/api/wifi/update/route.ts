import { NextResponse } from "next/server";
import { wifiUpdateSchema, JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

export async function POST(request: Request) {
  await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = wifiUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const input = parsed.data;
  const denied = await guardOnuAccess(input.onuId);
  if (denied) return denied;
  const jobId = await enqueueJob(JOB_NAMES.wifi, input);
  return NextResponse.json({ jobId });
}
