import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

/** Firmware distribution + never-informed counts for /cpe fleet page. */
export async function GET() {
  await requireUser();
  const staleBefore = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [total, neverInformed, byFw, pending] = await Promise.all([
    prisma.acsDevice.count({ where: { NOT: { deviceId: { startsWith: "pending:" } } } }),
    prisma.acsDevice.count({
      where: {
        NOT: { deviceId: { startsWith: "pending:" } },
        OR: [{ lastInform: null }, { lastInform: { lt: staleBefore } }],
      },
    }),
    prisma.acsDevice.groupBy({
      by: ["softwareVersion"],
      where: { NOT: { deviceId: { startsWith: "pending:" } } },
      _count: { _all: true },
      orderBy: { _count: { softwareVersion: "desc" } },
      take: 30,
    }),
    prisma.acsDevice.count({ where: { deviceId: { startsWith: "pending:" } } }),
  ]);

  return NextResponse.json({
    total,
    neverInformed,
    pendingProvision: pending,
    firmware: byFw.map((g) => ({
      version: g.softwareVersion ?? "(unknown)",
      count: g._count._all,
    })),
  });
}
