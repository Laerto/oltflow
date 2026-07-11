import { prisma, getNumberSetting, SETTING_KEYS } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { enqueue, enqueueOltSync } from "./queue.js";
import { kv, WORKER_HEARTBEAT_KEY } from "./kv.js";
import { syncRadius } from "./sync/radius.js";
import { checkAlarms } from "./sync/alarms.js";
import { syncPonTraffic } from "./sync/pon-traffic.js";
import { syncOltHealth } from "./sync/olt-health.js";
import { pruneOldData } from "./sync/prune.js";
import { runExpiryNotify } from "./notify/expiry.js";
import { acsMirrorIntervalMs } from "./sync/acs-mirror.js";
import { log } from "./logger.js";

// Env bootstrap fallbacks — DB Setting rows (hot-reloaded each tick) win when present.
const ENV_SYNC_MS = Number(process.env.SYNC_INTERVAL_MS ?? 60_000);
const ENV_ALARM_MS = Number(process.env.ALARM_INTERVAL_MS ?? 120_000);
const RADIUS_INTERVAL_MS = Number(process.env.RADIUS_INTERVAL_MS ?? 60_000);
const PON_TRAFFIC_INTERVAL_MS = Number(process.env.PON_TRAFFIC_INTERVAL_MS ?? 30_000);
const OLT_HEALTH_INTERVAL_MS = Number(process.env.OLT_HEALTH_INTERVAL_MS ?? 60_000);
const PRUNE_INTERVAL_MS = Number(process.env.PRUNE_INTERVAL_MS ?? 6 * 60 * 60 * 1000);

/** Spreads enqueue calls across a fraction of the tick interval instead of
 * firing all at once, so e.g. 100 OLTs don't all open sessions in the same
 * instant (BullMQ's `delay` option, no extra infra needed). */
function jitter(intervalMs: number): number {
  return Math.floor(Math.random() * Math.min(intervalMs / 4, 15_000));
}

async function syncIntervalMs(): Promise<number> {
  try {
    return await getNumberSetting(SETTING_KEYS.syncIntervalMs);
  } catch {
    return ENV_SYNC_MS;
  }
}

async function alarmIntervalMs(): Promise<number> {
  try {
    return await getNumberSetting(SETTING_KEYS.alarmIntervalMs);
  } catch {
    return ENV_ALARM_MS;
  }
}

/** One combined, deduped sync per OLT every tick. The sync itself decides which passes are
 * due (state always, signal ~5min, detail ~15min) and runs them under a single lock. */
async function tickSync() {
  const interval = await syncIntervalMs();
  const olts = await prisma.olt.findMany({ select: { id: true } });
  for (const olt of olts) {
    await enqueueOltSync(JOB_NAMES.syncOlt, olt.id, jitter(interval));
  }
}

/**
 * Self-rescheduling loop. `getIntervalMs` is re-read after every tick so DB settings
 * (Phase 1 Setting table) hot-reload without a worker restart.
 */
function loop(fn: () => Promise<void>, getIntervalMs: () => number | Promise<number>, label: string) {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      log.error({ err: String(err), label }, "scheduler tick failed");
    } finally {
      const ms = await getIntervalMs();
      setTimeout(run, ms);
    }
  };
  run();
}

async function tickRadius() {
  const n = await syncRadius();
  if (n) log.info({ enriched: n }, "radius sync");
}

async function tickAlarms() {
  const n = await checkAlarms();
  if (n) log.info({ sent: n }, "telegram alarms sent");
}

async function tickPonTraffic() {
  await syncPonTraffic();
}

async function tickOltHealth() {
  await syncOltHealth();
}

const HEARTBEAT_INTERVAL_MS = 30_000;
async function tickHeartbeat() {
  await kv.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 90);
}

async function tickPrune() {
  const n = await pruneOldData();
  if (n.signals || n.jobs || n.audit) {
    log.info({ signals: n.signals, jobs: n.jobs, audit: n.audit }, "prune");
  }
}

/**
 * Fire scheduled backups. Schedule formats:
 *   daily:HH:MM
 *   weekly:sun|mon|...:HH:MM
 * Checked every 60s; lastRunAt prevents double-fire within the same calendar day/week.
 */
async function tickBackupSchedule() {
  const targets = await prisma.backupTarget.findMany({
    where: { enabled: true, NOT: { schedule: null } },
  });
  const now = new Date();
  const day = now.toISOString().slice(0, 10); // UTC date for simplicity
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getUTCDay()]!;
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

  for (const t of targets) {
    const sched = (t.schedule ?? "").trim().toLowerCase();
    if (!sched) continue;
    let due = false;
    if (sched.startsWith("daily:")) {
      const want = sched.slice(6);
      due = want === hhmm;
    } else if (sched.startsWith("weekly:")) {
      const parts = sched.split(":");
      // weekly:sun:03:00
      const wantDay = parts[1];
      const wantTime = parts.slice(2).join(":");
      due = wantDay === weekday && wantTime === hhmm;
    }
    if (!due) continue;
    // Skip if already ran in the last 50 minutes (same slot window)
    if (t.lastRunAt && now.getTime() - t.lastRunAt.getTime() < 50 * 60_000) continue;

    const run = await prisma.backupRun.create({
      data: { targetId: t.id, status: "queued" },
    });
    // No Job-table row for scheduled backups — status lives on BackupRun.
    await enqueue(JOB_NAMES.backup, { runId: run.id, targetId: t.id });
    log.info({ targetId: t.id, runId: run.id, schedule: sched }, "scheduled backup enqueued");
  }
}

const BACKUP_SCHEDULE_MS = 60_000;

/**
 * WhatsApp expiry reminders — once per day at EXPIRY_NOTIFY_HOUR (UTC). Checked every 15 min; a
 * per-day guard (kv) prevents a double-fire. No-op unless EXPIRY_NOTIFY_ENABLED=true (and defaults
 * to dry-run). Albania is UTC+1/+2, so hour 8 UTC ≈ 09:00–10:00 local.
 */
const EXPIRY_NOTIFY_CHECK_MS = 15 * 60_000;
const EXPIRY_NOTIFY_HOUR = Number(process.env.EXPIRY_NOTIFY_HOUR ?? 8);
async function tickExpiryNotify() {
  if (new Date().getUTCHours() !== EXPIRY_NOTIFY_HOUR) return;
  const day = new Date().toISOString().slice(0, 10);
  if ((await kv.get("expiry-notify:lastrun")) === day) return;
  await kv.set("expiry-notify:lastrun", day);
  const r = await runExpiryNotify();
  if (!r.skipped) log.info({ ...r }, "expiry-notify daily run");
}

async function tickAcsMirror() {
  const { upserted, linked } = await (
    await import("./sync/acs-mirror.js")
  ).syncAcsMirror();
  if (upserted) log.info({ upserted, linked }, "acs-mirror");
}

export async function startScheduler() {
  const [syncMs, alarmMs, signalMs, detailMs, acsMs] = await Promise.all([
    syncIntervalMs(),
    alarmIntervalMs(),
    getNumberSetting(SETTING_KEYS.signalIntervalMs).catch(() => 300_000),
    getNumberSetting(SETTING_KEYS.detailIntervalMs).catch(() => 900_000),
    acsMirrorIntervalMs(),
  ]);

  loop(tickSync, syncIntervalMs, "sync-olt");
  loop(tickRadius, () => RADIUS_INTERVAL_MS, "sync-radius");
  loop(tickAlarms, alarmIntervalMs, "alarms");
  loop(tickPonTraffic, () => PON_TRAFFIC_INTERVAL_MS, "pon-traffic");
  loop(tickOltHealth, () => OLT_HEALTH_INTERVAL_MS, "olt-health");
  loop(tickPrune, () => PRUNE_INTERVAL_MS, "prune");
  loop(tickHeartbeat, () => HEARTBEAT_INTERVAL_MS, "heartbeat");
  loop(tickBackupSchedule, () => BACKUP_SCHEDULE_MS, "backup-schedule");
  loop(tickAcsMirror, acsMirrorIntervalMs, "acs-mirror");
  loop(tickExpiryNotify, () => EXPIRY_NOTIFY_CHECK_MS, "expiry-notify");

  log.info(
    {
      syncMs,
      signalMs,
      detailMs,
      alarmMs,
      radiusMs: RADIUS_INTERVAL_MS,
      ponTrafficMs: PON_TRAFFIC_INTERVAL_MS,
      oltHealthMs: OLT_HEALTH_INTERVAL_MS,
      pruneMs: PRUNE_INTERVAL_MS,
      backupScheduleMs: BACKUP_SCHEDULE_MS,
      acsMirrorMs: acsMs,
    },
    "scheduler started"
  );
}
