import { NextResponse } from "next/server";
import { getWanIpsBySerial } from "@oltflow/adapters";
import { hasTier, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOltAccess } from "@/lib/olt-access";
import { serializeOnu } from "@/lib/onu-serialize";
import { listOnus, parseOnuListParams } from "@/lib/onu-list";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const canOperate = hasTier(session.role, TIER.OPERATE);
  const { id } = await params;
  const oltId = Number(id);
  const denied = await guardOltAccess(oltId);
  if (denied) return denied;

  const url = new URL(request.url);
  const listParams = parseOnuListParams(url);

  const { rows, total, nextCursor, limit } = await listOnus({
    allowedOlts: "all", // guardOltAccess already scoped this OLT
    oltId,
    ...listParams,
  });

  const wanIps = await getWanIpsBySerial(
    GENIEACS_URL,
    rows.map((o) => o.serial ?? "")
  ).catch(() => new Map<string, string>());

  return NextResponse.json({
    onus: rows.map((o) =>
      serializeOnu(o, {
        canOperate,
        acsIp: (o.serial && wanIps.get(o.serial.toUpperCase())) || null,
      })
    ),
    total,
    nextCursor,
    limit,
  });
}
