import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { redis } from "@/lib/redis";
import { QUEUE_NAME } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";

/** BullMQ / Job browser for /admin/jobs. */
export async function GET(request: Request) {
  const denied = await requirePerm("jobs.view");
  if ("error" in denied && denied.error) return denied.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const [jobs, counts, queueCounts] = await Promise.all([
    prisma.job.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      include: { olt: { select: { name: true } } },
    }),
    prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
    Promise.all([
      redis.llen(`bull:${QUEUE_NAME}:wait`).catch(() => 0),
      redis.llen(`bull:${QUEUE_NAME}:active`).catch(() => 0),
      redis.zcard(`bull:${QUEUE_NAME}:delayed`).catch(() => 0),
      redis.zcard(`bull:${QUEUE_NAME}:failed`).catch(() => 0),
    ]),
  ]);

  const [waiting, active, delayed, failed] = queueCounts;
  const byStatus: Record<string, number> = {};
  for (const g of counts) byStatus[g.status] = g._count._all;

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      oltId: j.oltId,
      oltName: j.olt?.name ?? null,
      ponPort: j.ponPort,
      error: j.error,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
    byStatus,
    queue: { waiting, active, delayed, failed },
  });
}
