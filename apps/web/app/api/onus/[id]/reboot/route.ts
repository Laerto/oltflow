import { NextResponse } from "next/server";
import { rebootOnuSchema, JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const parsed = rebootOnuSchema.safeParse({ ...body, onuId: Number(id) });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }

  const jobId = await enqueueJob(JOB_NAMES.rebootOnu, parsed.data);
  return NextResponse.json({ jobId });
}
