import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { getWanIpsBySerial } from "@oltflow/adapters";
import { onuConnectionKind } from "@oltflow/core";
import { requireUser } from "@/lib/auth";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);

  const onus = await prisma.onu.findMany({
    where: { oltId },
    orderBy: { ponPort: "asc" },
    include: { signals: { orderBy: { recordedAt: "desc" }, take: 1 } },
  });

  const wanIps = await getWanIpsBySerial(GENIEACS_URL, onus.map((o) => o.serial ?? "")).catch(() => new Map<string, string>());

  return NextResponse.json({
    onus: onus.map((o) => {
      const signal = o.signals[0];
      const acsIp = (o.serial && wanIps.get(o.serial.toUpperCase())) || null;
      // RADIUS-sourced live IP (mgmtIp) + expiry are written to the DB by the worker.
      const bridge = onuConnectionKind(o.type) === "bridge";
      return {
        id: o.id,
        ponPort: o.ponPort,
        serial: o.serial,
        name: o.name,
        type: o.type,
        state: o.state,
        distance: o.distance,
        onlineDuration: o.onlineDuration,
        vlan: o.vlan,
        pppoeUser: o.pppoeUser,
        lineProfile: o.lineProfile,
        serviceProfile: o.serviceProfile,
        mac: o.mac,
        // Bridge → Mikrotik IP for Winbox; route → shown as WAN IP below.
        mgmtIp: bridge ? o.mgmtIp : null,
        expiration: o.expiration ? o.expiration.toISOString() : null,
        customer: null,
        lastSeen: o.lastSeen,
        // Route WAN IP: worker RADIUS live IP → GenieACS. Bridge shows Winbox (mgmtIp) instead.
        wanIp: bridge ? acsIp : o.mgmtIp || acsIp,
        onuRx: signal?.onuRx ?? null,
        onuTx: signal?.onuTx ?? null,
        oltRx: signal?.oltRx ?? null,
        oltTx: signal?.oltTx ?? null,
        attenUp: signal?.attenUp ?? null,
        attenDown: signal?.attenDown ?? null,
        signalLevel: signal?.signalLevel ?? null,
      };
    }),
    total: onus.length,
  });
}
