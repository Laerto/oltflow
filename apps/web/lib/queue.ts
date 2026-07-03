import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { QUEUE_NAME, type JobName } from "@oltflow/core";
import { prisma, Prisma } from "@oltflow/db";

// BullMQ vendors its own nested `ioredis` copy, type-incompatible with a top-level
// ioredis instance. Plain connection options let BullMQ own its own connection.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const url = new URL(REDIS_URL);
const connection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  password: url.password || undefined,
  maxRetriesPerRequest: null as null,
};

const globalForQueue = globalThis as unknown as { oltflowQueue?: Queue };

const queue = globalForQueue.oltflowQueue ?? new Queue(QUEUE_NAME, { connection });
if (process.env.NODE_ENV !== "production") {
  globalForQueue.oltflowQueue = queue;
}

/**
 * Creates a `Job` row and enqueues the matching BullMQ job with the same id, so the
 * UI can poll GET /api/jobs/:id for status/output/error.
 */
export async function enqueueJob(
  type: JobName,
  payload: Record<string, unknown>,
  opts: { oltId?: number; ponPort?: string } = {}
): Promise<string> {
  const id = randomUUID();
  await prisma.job.create({
    data: {
      id,
      type,
      status: "queued",
      oltId: opts.oltId ?? null,
      ponPort: opts.ponPort ?? null,
      payload: payload as Prisma.InputJsonValue,
    },
  });
  await queue.add(type, { ...payload, jobRowId: id }, { jobId: id });
  return id;
}

/**
 * Fire-and-forget enqueue with NO tracked `Job` row — for the scheduler-style sync jobs
 * (sync-inventory/detail/signals) the worker handles untracked. Used to kick a brand-new
 * OLT's first sweep immediately instead of waiting for the next scheduler tick (which is
 * what made a freshly-added OLT show zero ONUs until the worker happened to restart).
 * `delayMs` staggers the sweeps so they don't all contend on the OLT lock at once.
 */
export async function enqueueUntracked(
  type: JobName,
  payload: Record<string, unknown>,
  delayMs?: number
): Promise<void> {
  await queue.add(type, payload, { delay: delayMs, removeOnComplete: 200, removeOnFail: 500 });
}
