import { Queue } from "bullmq";
import { QUEUE_NAME } from "@oltflow/core";
import { connection } from "./redis.js";

export const queue = new Queue(QUEUE_NAME, { connection });

/** Enqueue a job. `jobRowId` ties it to a `Job` Prisma row for tracking/polling from
 * the web app; omit it for internal scheduler-driven jobs (sync-inventory/detail/signals)
 * that don't need a tracked row. `delayMs` staggers scheduler-driven enqueues so many
 * OLTs don't all fire their device sessions in the same instant. */
export function enqueue(name: string, data: Record<string, unknown>, jobRowId?: string, delayMs?: number) {
  return queue.add(
    name,
    { ...data, jobRowId },
    { jobId: jobRowId, removeOnComplete: 200, removeOnFail: 500, delay: delayMs }
  );
}
