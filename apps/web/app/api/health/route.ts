import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { redis } from "@/lib/redis";

export async function GET() {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then(() => true).catch(() => false),
  ]);
  const ok = dbOk && redisOk;
  return NextResponse.json({ status: ok ? "ok" : "degraded", db: dbOk, redis: redisOk }, { status: ok ? 200 : 503 });
}
