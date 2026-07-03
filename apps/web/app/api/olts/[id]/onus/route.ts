import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { getWanIpsBySerial } from "@oltflow/adapters";
import { hasTier, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { serializeOnu } from "@/lib/onu-serialize";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  // Only operate-tier users get the one-click Winbox URL (it embeds shared router creds).
  const canOperate = hasTier(session.role, TIER.OPERATE);
  const { id } = await params;
  const oltId = Number(id);

  const onus = await prisma.onu.findMany({
    where: { oltId },
    orderBy: { ponPort: "asc" },
    include: { signals: { orderBy: { recordedAt: "desc" }, take: 1 } },
  });

  const wanIps = await getWanIpsBySerial(GENIEACS_URL, onus.map((o) => o.serial ?? "")).catch(() => new Map<string, string>());

  return NextResponse.json({
    onus: onus.map((o) =>
      serializeOnu(o, { canOperate, acsIp: (o.serial && wanIps.get(o.serial.toUpperCase())) || null })
    ),
    total: onus.length,
  });
}
