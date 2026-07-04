import { Worker, type Job as BullJob } from "bullmq";
import { prisma } from "@oltflow/db";
import { JOB_NAMES, QUEUE_NAME, sanitizePayload } from "@oltflow/core";
import { connection } from "./redis.js";
import { writeAudit } from "./audit.js";
import { startScheduler } from "./scheduler.js";
import { syncOltInventory, syncOltDetail } from "./sync/inventory.js";
import { syncOltSignals } from "./sync/signals.js";
import { handleOltConnectTest } from "./handlers/oltConnectTest.js";
import { handleScanUnconfigured } from "./handlers/scanUnconfigured.js";
import { handleRefreshOnu } from "./handlers/refreshOnu.js";
import { handleOnuLive } from "./handlers/onuLive.js";
import { handleProvision } from "./handlers/provision.js";
import { handleAuthorizeEponOnu } from "./handlers/authorizeEponOnu.js";
import { handlePppoe } from "./handlers/pppoe.js";
import { handleAuthorizePppoe } from "./handlers/authorizePppoe.js";
import { handleWifi } from "./handlers/wifi.js";
import { handleSnmpDiscover } from "./handlers/snmpDiscover.js";
import { handleReplaceOnu } from "./handlers/replaceOnu.js";
import { handleDeleteOnu } from "./handlers/deleteOnu.js";
import { handleEnableWanAccess } from "./handlers/enableWanAccess.js";
import { handlePushAcs } from "./handlers/pushAcs.js";
import { handleRebootOnu } from "./handlers/rebootOnu.js";
import { handleRebootOnuCli } from "./handlers/rebootOnuCli.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  [JOB_NAMES.oltConnectTest]: handleOltConnectTest,
  [JOB_NAMES.scanUnconfigured]: handleScanUnconfigured,
  [JOB_NAMES.refreshOnu]: handleRefreshOnu,
  [JOB_NAMES.onuLive]: handleOnuLive,
  [JOB_NAMES.provision]: handleProvision,
  [JOB_NAMES.authorizeEponOnu]: handleAuthorizeEponOnu,
  [JOB_NAMES.pppoe]: handlePppoe,
  [JOB_NAMES.authorizePppoe]: handleAuthorizePppoe,
  [JOB_NAMES.wifi]: handleWifi,
  [JOB_NAMES.snmpDiscover]: handleSnmpDiscover,
  [JOB_NAMES.replaceOnu]: handleReplaceOnu,
  [JOB_NAMES.deleteOnu]: handleDeleteOnu,
  [JOB_NAMES.enableWanAccess]: handleEnableWanAccess,
  [JOB_NAMES.pushAcs]: handlePushAcs,
  [JOB_NAMES.rebootOnu]: handleRebootOnu,
  [JOB_NAMES.rebootOnuCli]: handleRebootOnuCli,
};

// Untracked: driven by the scheduler, no Job row / AuditLog (would flood both).
const UNTRACKED_HANDLERS: Record<string, (payload: { oltId: number }) => Promise<unknown>> = {
  [JOB_NAMES.syncInventory]: (p) => syncOltInventory(p.oltId),
  [JOB_NAMES.syncDetail]: (p) => syncOltDetail(p.oltId),
  [JOB_NAMES.syncSignals]: (p) => syncOltSignals(p.oltId),
};

async function processJob(job: BullJob) {
  const untracked = UNTRACKED_HANDLERS[job.name];
  if (untracked) {
    return untracked(job.data);
  }

  const handler = HANDLERS[job.name];
  if (!handler) throw new Error(`Nuk ka handler për job "${job.name}"`);

  const jobRowId = job.data.jobRowId as string | undefined;
  // High-frequency on-demand polls (live ONU view) skip the audit log to avoid flooding it.
  const silent = job.name === JOB_NAMES.onuLive;
  if (jobRowId) {
    await prisma.job.update({ where: { id: jobRowId }, data: { status: "active" } }).catch(() => {});
  }

  try {
    const result = await handler(job.data);
    if (jobRowId) {
      await prisma.job.update({
        where: { id: jobRowId },
        data: { status: "done", output: JSON.stringify(result) },
      });
    }
    if (!silent) await writeAudit({
      action: job.name,
      oltId: job.data.oltId ?? null,
      ponPort: job.data.ponPort ?? null,
      payload: sanitizePayload(job.data),
      result: "success",
    });
    return result;
  } catch (err) {
    const message = (err as Error).message;
    if (jobRowId) {
      await prisma.job.update({ where: { id: jobRowId }, data: { status: "failed", error: message } });
    }
    if (!silent)
      await writeAudit({
        action: job.name,
        oltId: job.data.oltId ?? null,
        ponPort: job.data.ponPort ?? null,
        payload: sanitizePayload(job.data),
        result: "error",
      });
    throw err;
  }
}

// Jobs are I/O-bound (waiting on network round-trips to OLTs/GenieACS), not
// CPU-bound, so a much higher concurrency than the old default of 4 is safe —
// the per-OLT lock (olt-lock.ts) stops this from over-parallelizing against
// any single device; it only bounds how many *different* OLTs run at once.
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 20);
const worker = new Worker(QUEUE_NAME, processJob, { connection, concurrency: WORKER_CONCURRENCY });

worker.on("ready", () => console.log(`[worker] listening on queue "${QUEUE_NAME}"`));
worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} (${job?.name}) failed:`, err.message));

startScheduler();

process.on("SIGTERM", () => {
  void worker.close().then(() => process.exit(0));
});
