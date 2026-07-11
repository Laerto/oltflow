import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { redis } from "@/lib/redis";
import { QUEUE_NAME } from "@oltflow/core";
import { requireAdminAccess } from "@/lib/authorize";

const WORKER_HEARTBEAT_KEY = "oltflow:worker:heartbeat";

/** System-health overview for /admin. */
export async function GET() {
  const denied = await requireAdminAccess();
  if ("error" in denied && denied.error) return denied.error;

  const now = Date.now();
  const [
    oltCount,
    onuCount,
    userCount,
    openAlarms,
    openTickets,
    recentJobs,
    workerBeat,
    oldestSync,
    queueCounts,
    sessionCount,
    failedJobs24h,
  ] = await Promise.all([
    prisma.olt.count(),
    prisma.onu.count(),
    prisma.user.count(),
    prisma.alarm.count({ where: { clearedAt: null } }),
    prisma.ticket.count({ where: { status: { in: ["open", "assigned", "in_progress"] } } }),
    prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, type: true, status: true, error: true, createdAt: true, oltId: true },
    }),
    redis.get(WORKER_HEARTBEAT_KEY).catch(() => null),
    prisma.olt.findFirst({
      where: { lastSync: { not: null } },
      orderBy: { lastSync: "asc" },
      select: { id: true, name: true, lastSync: true },
    }),
    Promise.all([
      redis.llen(`bull:${QUEUE_NAME}:wait`).catch(() => 0),
      redis.llen(`bull:${QUEUE_NAME}:active`).catch(() => 0),
      redis.zcard(`bull:${QUEUE_NAME}:delayed`).catch(() => 0),
      redis.zcard(`bull:${QUEUE_NAME}:failed`).catch(() => 0),
    ]),
    prisma.session.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.job.count({
      where: {
        status: "failed",
        createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const [waiting, active, delayed, failed] = queueCounts;
  const olts = await prisma.olt.findMany({
    select: { id: true, name: true, status: true, lastSync: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    health: {
      db: true,
      redis: true,
      worker: Boolean(workerBeat),
      workerLastBeat: workerBeat,
    },
    counts: {
      olts: oltCount,
      onus: onuCount,
      users: userCount,
      openAlarms,
      openTickets,
      activeSessions: sessionCount,
      failedJobs24h,
    },
    queue: { waiting, active, delayed, failed },
    syncLagSec: oldestSync?.lastSync
      ? Math.max(0, Math.floor((now - oldestSync.lastSync.getTime()) / 1000))
      : null,
    stalestOlt: oldestSync
      ? { id: oldestSync.id, name: oldestSync.name, lastSync: oldestSync.lastSync }
      : null,
    olts: olts.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      lastSync: o.lastSync,
      lagSec: o.lastSync ? Math.max(0, Math.floor((now - o.lastSync.getTime()) / 1000)) : null,
    })),
    recentJobs: recentJobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
    })),
  });
}
