import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = globalForRedis.redis ?? new Redis(REDIS_URL, { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Get-or-compute JSON cache with a short TTL. Fails open: any Redis error falls
 * back to computing the fresh value, so the cache is a speed-up, never a
 * dependency. Use only for cheap-to-recompute rollups where a few seconds of
 * staleness is fine (dashboards, alarm feeds) — never for authz decisions.
 */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // Redis down/slow → skip the read, compute fresh below.
  }
  const value = await compute();
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Non-fatal: value is already computed.
  }
  return value;
}
