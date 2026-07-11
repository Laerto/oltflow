import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";
import { guardOnuAccess } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Factory reset is destructive — require operate-tier via onu.reboot (closest capability)
  const auth = await requirePerm("onu.reboot");
  if ("error" in auth) return auth.error;
  const onuId = Number((await params).id);
  const denied = await guardOnuAccess(onuId);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  let deviceId = body.deviceId as string | undefined;
  if (!deviceId) {
    const acs = await prisma.acsDevice.findFirst({ where: { onuId } });
    deviceId = acs?.deviceId;
  }
  if (!deviceId || deviceId.startsWith("pending:")) {
    return NextResponse.json({ error: "Nuk ka deviceId ACS për këtë ONU" }, { status: 400 });
  }

  const jobId = await enqueueJob(JOB_NAMES.acsFactoryReset, { onuId, deviceId });
  return NextResponse.json({ jobId });
}
