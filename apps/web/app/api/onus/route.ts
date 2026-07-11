import { NextResponse } from "next/server";
import { getWanIpsBySerial } from "@oltflow/adapters";
import { hasTier, TIER } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";
import { serializeOnu } from "@/lib/onu-serialize";
import { listOnus, parseOnuListParams } from "@/lib/onu-list";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

/**
 * Fleet-wide ONU list with keyset pagination + server-side search.
 * Query: ?q=&status=all|online|offline&signal=all|good|warning|critical&cursor=&limit=
 * Without params defaults to first page (100 rows) — never dumps the whole fleet.
 */
export async function GET(request: Request) {
  const session = await requireUser();
  const canOperate = hasTier(session.role, TIER.OPERATE);
  const allowed = await allowedOltIds(session);
  const url = new URL(request.url);
  const params = parseOnuListParams(url);

  const { rows, total, nextCursor, limit } = await listOnus({
    allowedOlts: allowed,
    ...params,
  });

  // GenieACS WAN IPs only for this page (not the whole fleet).
  const wanIps = await getWanIpsBySerial(
    GENIEACS_URL,
    rows.map((o) => o.serial ?? "")
  ).catch(() => new Map<string, string>());

  return NextResponse.json({
    onus: rows.map((o) =>
      serializeOnu(o, {
        canOperate,
        acsIp: (o.serial && wanIps.get(o.serial.toUpperCase())) || null,
        oltName: o.olt.name,
      })
    ),
    total,
    nextCursor,
    limit,
  });
}
