import { NextResponse } from "next/server";
import { rebootOnuSchema, JOB_NAMES } from "@oltflow/core";
import { guardOnuAccess } from "@/lib/olt-access";
import { requirePerm } from "@/lib/authorize";
import { enqueueJob } from "@/lib/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Granular permission (Phase 2) — replaces blanket OPERATE tier for reboot.
  const auth = await requirePerm("onu.reboot");
  if ("error" in auth) return auth.error;
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
