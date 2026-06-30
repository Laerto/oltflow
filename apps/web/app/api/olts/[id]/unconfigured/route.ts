import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

// Reads the persisted unconfigured (waiting-authorization) ONUs for an OLT — kept
// continuously up to date by the worker's inventory sync, so no live device scan
// (and no network delay) on page load.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const rows = await prisma.uncfgOnu.findMany({
    where: { oltId: Number(id) },
    orderBy: { firstSeen: "asc" },
    select: { ponPort: true, serial: true, state: true, firstSeen: true },
  });
  return NextResponse.json({
    onus: rows.map((r) => ({ ponPort: r.ponPort, serial: r.serial, state: r.state ?? "unknown" })),
    total: rows.length,
  });
}
