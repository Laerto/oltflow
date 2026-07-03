import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { getWanIpsBySerial } from "@oltflow/adapters";
import { hasTier, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { serializeOnu } from "@/lib/onu-serialize";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

/**
 * All ONUs across every OLT — powers the "All OLTs" mode in the ONU list, so support can
 * find a customer by name/serial/PPPoE/IP without knowing which OLT they're on. Each row
 * carries its `oltName` for the OLT column. At the current fleet size (~1–2k ONUs) this is
 * a single cheap query; add pagination/server-side search here if the fleet grows large.
 */
export async function GET() {
  const session = await requireUser();
  const canOperate = hasTier(session.role, TIER.OPERATE);

  const onus = await prisma.onu.findMany({
    orderBy: [{ oltId: "asc" }, { ponPort: "asc" }],
    include: {
      signals: { orderBy: { recordedAt: "desc" }, take: 1 },
      olt: { select: { name: true } },
    },
  });

  const wanIps = await getWanIpsBySerial(GENIEACS_URL, onus.map((o) => o.serial ?? "")).catch(
    () => new Map<string, string>()
  );

  return NextResponse.json({
    onus: onus.map((o) =>
      serializeOnu(o, {
        canOperate,
        acsIp: (o.serial && wanIps.get(o.serial.toUpperCase())) || null,
        oltName: o.olt.name,
      })
    ),
    total: onus.length,
  });
}
