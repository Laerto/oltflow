import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { classifySignal } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";

// Network-map data: OLTs (with coords) + geolocated ONUs colored by their latest signal
// band. Scoped to the user's OLTs. Only ONUs that have coordinates are returned so the
// payload stays small as the fleet grows.
export async function GET() {
  const session = await requireUser();
  const allowed = await allowedOltIds(session);
  const oltFilter = allowed === "all" ? {} : { id: { in: allowed } };
  const onuFilter = { latitude: { not: null }, ...(allowed === "all" ? {} : { oltId: { in: allowed } }) };

  const [olts, onus] = await Promise.all([
    prisma.olt.findMany({
      where: oltFilter,
      select: { id: true, name: true, latitude: true, longitude: true, status: true, location: true },
    }),
    prisma.onu.findMany({
      where: onuFilter,
      select: {
        id: true,
        name: true,
        ponPort: true,
        oltId: true,
        latitude: true,
        longitude: true,
        state: true,
        signals: { orderBy: { recordedAt: "desc" }, take: 1, select: { onuRx: true } },
      },
    }),
  ]);

  return NextResponse.json({
    olts: olts
      .filter((o) => o.latitude != null && o.longitude != null)
      .map((o) => ({ id: o.id, name: o.name, lat: o.latitude, lng: o.longitude, status: o.status, location: o.location })),
    onus: onus.map((o) => {
      const rx = o.signals[0]?.onuRx ?? null;
      return {
        id: o.id,
        name: o.name,
        ponPort: o.ponPort,
        oltId: o.oltId,
        lat: o.latitude,
        lng: o.longitude,
        state: o.state,
        onuRx: rx,
        band: o.state === "working" ? classifySignal(rx) : "offline",
      };
    }),
  });
}
