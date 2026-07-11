import { redis } from "@/lib/redis";

const WINDOW = 15 * 60;

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function rateLimit(
  key: string,
  max: number,
  windowSec = WINDOW
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    if (count > max) {
      const ttl = await redis.ttl(key);
      return { ok: false, retryAfter: ttl > 0 ? ttl : windowSec };
    }
    return { ok: true };
  } catch {
    // Redis down — fail open for auth UX (login still has its own guard).
    return { ok: true };
  }
}
