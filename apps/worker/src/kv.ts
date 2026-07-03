import { Redis } from "ioredis";

// Shared plain ioredis client for non-BullMQ uses (locks, heartbeat, alarm dedup).
// BullMQ owns its own connection built from ./redis.js options — see the note there.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const kv = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

/** Key the web tier's /api/health reads to tell whether a worker is alive. */
export const WORKER_HEARTBEAT_KEY = "oltflow:worker:heartbeat";
