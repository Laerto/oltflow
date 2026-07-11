import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";
import { iterateOnusForExport, parseOnuListParams } from "@/lib/onu-list";
import { csvRow, csvStamp } from "@/lib/csv";

/**
 * CSV export of the fleet ONU list. Honours the exact same search/filter/scope
 * as GET /api/onus (?q=&status=&signal=), but streams every matching row (keyset
 * batched, capped) instead of one page. Response is a download.
 */
export async function GET(request: Request) {
  const session = await requireUser();
  const allowed = await allowedOltIds(session);
  const url = new URL(request.url);
  const { q, status, signal } = parseOnuListParams(url);

  // Optional single-OLT scope (per-OLT list export), enforced against the user's scope.
  const oltRaw = url.searchParams.get("oltId");
  let oltId: number | undefined;
  if (oltRaw && Number.isFinite(Number(oltRaw))) {
    oltId = Number(oltRaw);
    if (allowed !== "all" && !allowed.includes(oltId)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const header = [
    "OLT",
    "Serial",
    "Emri",
    "PON",
    "Tipi",
    "Gjendja",
    "Rx (dBm)",
    "Distanca (m)",
    "PPPoE",
    "IP",
    "MAC",
    "VLAN",
    "Skadenca",
    "Sinjali i fundit",
  ];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      // BOM so Excel opens UTF-8 (Albanian ë/ç) correctly.
      controller.enqueue(enc.encode("﻿" + csvRow(header) + "\r\n"));
      try {
        for await (const o of iterateOnusForExport({ allowedOlts: allowed, oltId, q, status, signal })) {
          const rx = o.signals[0]?.onuRx ?? o.lastOnuRx ?? null;
          controller.enqueue(
            enc.encode(
              csvRow([
                o.olt.name,
                o.serial,
                o.name,
                o.ponPort,
                o.type,
                o.state,
                rx,
                o.distance,
                o.pppoeUser,
                o.mgmtIp,
                o.mac,
                o.vlan,
                o.expiration ? o.expiration.toISOString().slice(0, 10) : "",
                o.lastSeen ? o.lastSeen.toISOString() : "",
              ]) + "\r\n"
            )
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="onus-${csvStamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
