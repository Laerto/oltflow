import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { getWanIpsBySerial } from "@oltflow/adapters";
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
        lastSeen: o.lastSeen,
        wanIp: (o.serial && wanIps.get(o.serial.toUpperCase())) || null,
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
