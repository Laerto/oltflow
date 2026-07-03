import { kv as redis } from "./kv.js";

export class OltBusyError extends Error {
  constructor(oltId: number) {
    super(`OLT ${oltId} është i zënë nga një operacion tjetër — provo përsëri`);
    this.name = "OltBusyError";
  }
}

function lockKey(oltId: number) {
  return `oltflow:olt-lock:${oltId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensures only one Telnet/SSH/SNMP session is open against a given OLT at a
 * time, even across multiple worker replicas (`docker compose up --scale
 * worker=N`, the documented scaling path for 100 OLTs).
 *
 * The lock uses a short TTL that's renewed on a heartbeat while `fn()` runs,
 * instead of one long TTL — if the worker process dies mid-operation (crash,
 * OOM, `tsx watch` restart, deploy) the heartbeat stops and the lock expires
 * within `ttlSeconds`, not after some long worst-case duration.
 *
 * Acquisition retries with backoff for up to `maxWaitMs` before throwing
 * OltBusyError — most contention is a background sync tick that finishes in
 * a second or two (a small OLT's state/detail/signal sweep is fast), and
 * failing a user's click instantly just because it landed in that window is
 * worse UX than a short, bounded wait. Genuinely long-running sessions (e.g.
 * a slow detail sweep on a 1000-ONU OLT) still fail fast for callers that
 * can't afford to wait, since maxWaitMs is well under the heartbeat TTL.
 */
export async function withOltLock<T>(
  oltId: number,
  fn: () => Promise<T>,
  opts: { ttlSeconds?: number; maxWaitMs?: number } = {}
): Promise<T> {
  const ttlSeconds = opts.ttlSeconds ?? 30;
  const maxWaitMs = opts.maxWaitMs ?? 20000;
  const key = lockKey(oltId);

  const start = Date.now();
  let acquired: string | null = null;
  while (!(acquired = await redis.set(key, "1", "EX", ttlSeconds, "NX"))) {
    if (Date.now() - start >= maxWaitMs) throw new OltBusyError(oltId);
    await sleep(250 + Math.random() * 250);
  }

  const heartbeat = setInterval(() => {
    redis.expire(key, ttlSeconds).catch(() => {});
  }, (ttlSeconds * 1000) / 3);

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    await redis.del(key).catch(() => {});
  }
}
