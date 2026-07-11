import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardTier } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

const ACS_URL = process.env.ACS_URL ?? "";

// Bulk-injects the configured TR-069 ACS URL into every GPON ONU of an OLT, so ONUs
// that carry an old/unreachable ACS URL start informing GenieACS.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const tierDenied = await guardTier(TIER.ADMIN);
  if (tierDenied) return tierDenied;
  const { id } = await params;
  const oltId = Number(id);
  const olt = await prisma.olt.findUnique({ where: { id: oltId } });
  if (!olt) return NextResponse.json({ error: "OLT nuk u gjet" }, { status: 404 });
  if (!ACS_URL) return NextResponse.json({ error: "ACS_URL nuk është konfiguruar në server" }, { status: 400 });

  const jobId = await enqueueJob(JOB_NAMES.pushAcs, { oltId, acsUrl: ACS_URL }, { oltId });
  return NextResponse.json({ jobId, acsUrl: ACS_URL });
}
