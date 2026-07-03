import { prisma } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { enqueue } from "./queue.js";
import { syncRadius } from "./sync/radius.js";
import { checkAlarms } from "./sync/alarms.js";
import { syncPonTraffic } from "./sync/pon-traffic.js";
import { pruneOldData } from "./sync/prune.js";

const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 60_000);
const DETAIL_INTERVAL_MS = Number(process.env.DETAIL_INTERVAL_MS ?? 900_000); // 15 min
const SIGNAL_INTERVAL_MS = Number(process.env.SIGNAL_INTERVAL_MS ?? 300_000);
const RADIUS_INTERVAL_MS = Number(process.env.RADIUS_INTERVAL_MS ?? 60_000);
const ALARM_INTERVAL_MS = Number(process.env.ALARM_INTERVAL_MS ?? 120_000);
// 30s keeps the 32-bit octet counters from wrapping unnoticed at typical PON loads.
const PON_TRAFFIC_INTERVAL_MS = Number(process.env.PON_TRAFFIC_INTERVAL_MS ?? 30_000);
const PRUNE_INTERVAL_MS = Number(process.env.PRUNE_INTERVAL_MS ?? 6 * 60 * 60 * 1000); // 6h

/** Spreads enqueue calls across a fraction of the tick interval instead of
 * firing all at once, so e.g. 100 OLTs don't all open sessions in the same
 * instant (BullMQ's `delay` option, no extra infra needed). */
function jitter(intervalMs: number): number {
  return Math.floor(Math.random() * Math.min(intervalMs / 4, 15_000));
}

async function tickInventory() {
  const olts = await prisma.olt.findMany({ select: { id: true } });
  for (const olt of olts) {
    await enqueue(JOB_NAMES.syncInventory, { oltId: olt.id }, undefined, jitter(SYNC_INTERVAL_MS));
  }
}

async function tickDetail() {
  const olts = await prisma.olt.findMany({ select: { id: true } });
  for (const olt of olts) {
    await enqueue(JOB_NAMES.syncDetail, { oltId: olt.id }, undefined, jitter(DETAIL_INTERVAL_MS));
  }
}

async function tickSignals() {
  const olts = await prisma.olt.findMany({ select: { id: true } });
  for (const olt of olts) {
    await enqueue(JOB_NAMES.syncSignals, { oltId: olt.id }, undefined, jitter(SIGNAL_INTERVAL_MS));
  }
}

/** Self-rescheduling loops (instead of setInterval) so a slow tick can't overlap the next one.
 * Runs immediately on startup, then waits intervalMs between subsequent runs — otherwise a
 * freshly-added OLT (or a worker restart) would sit with no detail/signal data for a full
 * DETAIL_INTERVAL_MS/SIGNAL_INTERVAL_MS before the first pass ever ran. */
function loop(fn: () => Promise<void>, intervalMs: number, label: string) {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[scheduler] ${label} failed:`, err);
    } finally {
      setTimeout(run, intervalMs);
    }
  };
  run();
}

async function tickRadius() {
  const n = await syncRadius();
  if (n) console.log(`[scheduler] radius enriched ${n} ONUs`);
}

async function tickAlarms() {
  const n = await checkAlarms();
  if (n) console.log(`[scheduler] sent ${n} Telegram alarm(s)`);
}

async function tickPonTraffic() {
  await syncPonTraffic();
}

async function tickPrune() {
  const n = await pruneOldData();
  if (n.signals || n.jobs || n.audit) console.log(`[scheduler] pruned signals=${n.signals} jobs=${n.jobs} audit=${n.audit}`);
}

export function startScheduler() {
  loop(tickInventory, SYNC_INTERVAL_MS, "sync-inventory");
  loop(tickDetail, DETAIL_INTERVAL_MS, "sync-detail");
  loop(tickSignals, SIGNAL_INTERVAL_MS, "sync-signals");
  loop(tickRadius, RADIUS_INTERVAL_MS, "sync-radius");
  loop(tickAlarms, ALARM_INTERVAL_MS, "alarms");
  loop(tickPonTraffic, PON_TRAFFIC_INTERVAL_MS, "pon-traffic");
  loop(tickPrune, PRUNE_INTERVAL_MS, "prune");
  console.log(
    `[scheduler] inventory ${SYNC_INTERVAL_MS}ms, detail ${DETAIL_INTERVAL_MS}ms, signals ${SIGNAL_INTERVAL_MS}ms, radius ${RADIUS_INTERVAL_MS}ms, alarms ${ALARM_INTERVAL_MS}ms, pon-traffic ${PON_TRAFFIC_INTERVAL_MS}ms, prune ${PRUNE_INTERVAL_MS}ms`
  );
}
