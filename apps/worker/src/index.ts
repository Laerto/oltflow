import { Worker, type Job as BullJob } from "bullmq";
import { prisma, ensureDefaultSettings } from "@oltflow/db";
import { JOB_NAMES, QUEUE_NAME, sanitizePayload } from "@oltflow/core";
import { connection } from "./redis.js";
import { writeAudit } from "./audit.js";
import { startScheduler } from "./scheduler.js";
import { initLogger, log } from "./logger.js";
import { syncOlt } from "./sync/olt-sync.js";
import { syncShelf } from "./sync/shelf-sync.js";
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
import { handleSetOnuName } from "./handlers/setOnuName.js";
import { handleRebootOnu } from "./handlers/rebootOnu.js";
import { handleRebootOnuCli } from "./handlers/rebootOnuCli.js";
import { handleBackup, handleBackupVerify } from "./handlers/backup.js";
import { handleAcsRefresh } from "./handlers/acsRefresh.js";
import { handleAcsFactoryReset } from "./handlers/acsFactoryReset.js";
import { handleAcsCheckRegistration } from "./handlers/acsCheckRegistration.js";
import { syncAcsMirror } from "./sync/acs-mirror.js";
import { startWhatsapp } from "./whatsapp/manager.js";
import { startTelegramBot } from "./telegram-bot.js";

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
  [JOB_NAMES.setOnuName]: handleSetOnuName,
  [JOB_NAMES.rebootOnu]: handleRebootOnu,
  [JOB_NAMES.rebootOnuCli]: handleRebootOnuCli,
  [JOB_NAMES.backup]: handleBackup,
  [JOB_NAMES.backupVerify]: handleBackupVerify,
  [JOB_NAMES.acsRefresh]: handleAcsRefresh,
  [JOB_NAMES.acsFactoryReset]: handleAcsFactoryReset,
  [JOB_NAMES.acsCheckRegistration]: handleAcsCheckRegistration,
  // User-triggered "Resync now" — forces a full immediate sweep (state+signal+detail) of one OLT so
  // ONUs added/changed from a parallel tool (NetNumen) appear without waiting for the ~15-min cycle.
  [JOB_NAMES.resyncOlt]: async (p) => {
    const count = await syncOlt(p.oltId as number, { force: true });
    return { message: `Sinkronizim i plotë u krye — ${count} ONU u lexuan`, count };
  },
};

// Untracked: driven by the scheduler, no Job row / AuditLog (would flood both). One combined,
// deduped sweep per OLT — it self-skips (returns 0) when the OLT is busy with a user action,
// so nothing is re-enqueued and the queue never piles up.
const UNTRACKED_HANDLERS: Record<string, (payload: Record<string, unknown>) => Promise<unknown>> = {
  [JOB_NAMES.syncOlt]: (p) => syncOlt(p.oltId as number),
  [JOB_NAMES.syncShelf]: (p) => syncShelf(p.oltId as number),
  [JOB_NAMES.acsMirror]: () => syncAcsMirror(),
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

worker.on("ready", () => log.info({ queue: QUEUE_NAME, concurrency: WORKER_CONCURRENCY }, "worker ready"));
worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "job failed")
);

async function boot() {
  await initLogger();
  const seeded = await ensureDefaultSettings().catch((err) => {
    log.warn({ err: String(err) }, "settings seed failed (will use env defaults)");
    return 0;
  });
  if (seeded) log.info({ seeded }, "default settings seeded");
  await startScheduler();
  // Persistent WhatsApp (Baileys) socket + control channel. Failure here must not
  // block the worker — notifications on other channels keep working.
  await startWhatsapp().catch((err) => log.warn({ err: String(err) }, "whatsapp start failed"));
  // Inbound Telegram command bot (getUpdates long-poll). Runs in the background; its own
  // loop swallows errors, so no await — it must never block boot.
  void startTelegramBot().catch((err) => log.warn({ err: String(err) }, "telegram bot start failed"));
}

void boot();

process.on("SIGTERM", () => {
  void worker.close().then(() => process.exit(0));
});
