import { NextResponse } from "next/server";
import { authorizeEponSchema, JOB_NAMES, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOltAccess, guardTier } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

// EPON one-click authorization. Same OPERATE tier as GPON provisioning (proxy.ts already
// gates POST /api/provision/* at TIER.OPERATE), separate route because the EPON write-path
// binds by MAC and uses a different command recipe than GPON.
export async function POST(request: Request) {
  await requireUser();
  const tierDenied = await guardTier(TIER.OPERATE);
  if (tierDenied) return tierDenied;
  const body = await request.json().catch(() => null);
  const parsed = authorizeEponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const input = parsed.data;
  const denied = await guardOltAccess(input.oltId);
  if (denied) return denied;
  const jobId = await enqueueJob(JOB_NAMES.authorizeEponOnu, input, { oltId: input.oltId, ponPort: input.ponPort });
  return NextResponse.json({ jobId });
}
