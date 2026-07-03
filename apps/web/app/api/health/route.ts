import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { redis } from "@/lib/redis";

// Set by the worker scheduler every 30s with a 90s TTL — absent ⇒ no live worker.
const WORKER_HEARTBEAT_KEY = "oltflow:worker:heartbeat";

export async function GET() {
  const [dbOk, redisOk, workerBeat] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then(() => true).catch(() => false),
    redis.get(WORKER_HEARTBEAT_KEY).catch(() => null),
  ]);
  const workerOk = Boolean(workerBeat);
  // Only db/redis gate the 503 — a worker outage degrades sync but the web app itself
  // still serves, and external probes restarting `web` over it would make things worse.
  const ok = dbOk && redisOk;
  return NextResponse.json(
    {
      status: ok && workerOk ? "ok" : "degraded",
      db: dbOk,
      redis: redisOk,
      worker: workerOk,
      workerLastBeat: workerBeat,
    },
    { status: ok ? 200 : 503 }
  );
}
