import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES, TIER, isEponPort } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess, guardTier } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

const ACS_URL = process.env.ACS_URL ?? "";

// Injects the configured TR-069 ACS URL into THIS ONU (unlock + acs URL via the OLT CLI), so a CPE
// that was never pointed at GenieACS starts informing — without logging into its web UI one by one.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const tierDenied = await guardTier(TIER.OPERATE);
  if (tierDenied) return tierDenied;
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
  const onu = await prisma.onu.findUnique({ where: { id: Number(id) } });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });
  if (isEponPort(onu.ponPort)) return NextResponse.json({ error: "TR-069 nuk mbështetet për EPON" }, { status: 400 });
  if (!ACS_URL) return NextResponse.json({ error: "ACS_URL nuk është konfiguruar në server" }, { status: 400 });

  const jobId = await enqueueJob(
    JOB_NAMES.pushAcs,
    { oltId: onu.oltId, acsUrl: ACS_URL, ponPorts: [onu.ponPort] },
    { oltId: onu.oltId, ponPort: onu.ponPort }
  );
  return NextResponse.json({ jobId, acsUrl: ACS_URL });
}
