import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { guardOltAccess } from "@/lib/olt-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const denied = await guardOltAccess(oltId);
  if (denied) return denied;

  const now = Date.now();
  const in7Days = new Date(now + 7 * 24 * 60 * 60 * 1000);
  // Only clients worth chasing: expiring within 7 days OR expired at most 14 days ago.
  // Anyone expired long ago (months/years) has left the network — exclude them.
  const graceStart = new Date(now - 14 * 24 * 60 * 60 * 1000);

  const [stateGroups, recentSignals, expiringList] = await Promise.all([
    // One grouped pass over [oltId, state] (indexed) gives total, online, and the
    // offline-reason split shown on the dashboard cards. State strings come straight
    // from the OLT and vary in case (e.g. "OffLine" vs "Offline"), so compare lower-cased.
    prisma.onu.groupBy({ by: ["state"], where: { oltId }, _count: { _all: true } }),
    // Both signal levels in one pass; distinct per ONU so an ONU logging several rows in
    // the window is counted once. Served by the new [signalLevel, recordedAt] index.
    prisma.signal.findMany({
      where: {
        signalLevel: { in: ["warning", "critical"] },
        recordedAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
        onu: { oltId },
      },
      select: { onuId: true, signalLevel: true },
      distinct: ["onuId", "signalLevel"],
    }),
    // Clients whose RADIUS subscription has expired or expires within 7 days — the
    // office works this list daily to call people in to pay. Soonest (most overdue) first.
    prisma.onu.findMany({
      where: { oltId, expiration: { gte: graceStart, lte: in7Days } },
      select: { id: true, name: true, ponPort: true, expiration: true, pppoeUser: true },
      orderBy: { expiration: "asc" },
      take: 60,
    }),
  ]);

  // Roll the grouped state counts into the fleet totals + offline-reason breakdown.
  // PwrFail = power off / dying gasp, LoS = loss of signal, N/A = any other offline state.
  let total = 0;
  let online = 0;
  let pwrFail = 0;
  let los = 0;
  for (const g of stateGroups) {
    const n = g._count._all;
    total += n;
    const s = (g.state ?? "").toLowerCase();
    if (s === "working") online += n;
    else if (s === "power off" || s === "poweroff" || s === "dyinggasp") pwrFail += n;
    else if (s === "los") los += n;
  }
  const offline = total - online;

  return NextResponse.json({
    total,
    online,
    offline,
    pwrFail,
    los,
    naOffline: offline - pwrFail - los,
    criticalSignal: recentSignals.filter((s) => s.signalLevel === "critical").length,
    warningSignal: recentSignals.filter((s) => s.signalLevel === "warning").length,
    expiring: expiringList.map((o) => ({
      id: o.id,
      name: o.name,
      ponPort: o.ponPort,
      expiration: o.expiration?.toISOString() ?? null,
      pppoeUser: o.pppoeUser,
    })),
  });
}
