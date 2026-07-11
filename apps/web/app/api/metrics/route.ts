import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { redis } from "@/lib/redis";
import { QUEUE_NAME } from "@oltflow/core";

/**
 * Prometheus text exposition for the NOC panel itself (not customer traffic).
 * Scrapable by Grafana/Prometheus. Unauthenticated on purpose for local scrapers
 * behind nginx — lock down at the reverse-proxy if the metrics port is public.
 *
 * Metrics:
 *  - oltflow_olts / oltflow_onus / oltflow_alarms_open
 *  - oltflow_queue_waiting / active / delayed / failed
 *  - oltflow_worker_up (1/0 from heartbeat)
 *  - oltflow_sync_lag_seconds (max age of Olt.lastSync)
 */

const WORKER_HEARTBEAT_KEY = "oltflow:worker:heartbeat";

function line(name: string, value: number, labels?: Record<string, string>): string {
  const lbl = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}="${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
        .join(",")}}`
    : "";
  return `${name}${lbl} ${Number.isFinite(value) ? value : 0}`;
}

export async function GET() {
  const now = Date.now();
  const [
    oltCount,
    onuCount,
    openAlarms,
    criticalAlarms,
    workerBeat,
    oldestSync,
    queueCounts,
  ] = await Promise.all([
    prisma.olt.count().catch(() => 0),
    prisma.onu.count().catch(() => 0),
    prisma.alarm.count({ where: { clearedAt: null } }).catch(() => 0),
    prisma.alarm.count({ where: { clearedAt: null, severity: "critical" } }).catch(() => 0),
    redis.get(WORKER_HEARTBEAT_KEY).catch(() => null),
    prisma.olt
      .findFirst({
        where: { lastSync: { not: null } },
        orderBy: { lastSync: "asc" },
        select: { lastSync: true },
      })
      .catch(() => null),
    // BullMQ stores counts under keys like bull:<queue>:wait — use the Queue API via redis LLEN
    // of the standard list keys so we don't need bullmq on every metrics scrape path.
    Promise.all([
      redis.llen(`bull:${QUEUE_NAME}:wait`).catch(() => 0),
      redis.llen(`bull:${QUEUE_NAME}:active`).catch(() => 0),
      redis.zcard(`bull:${QUEUE_NAME}:delayed`).catch(() => 0),
      redis.zcard(`bull:${QUEUE_NAME}:failed`).catch(() => 0),
    ]),
  ]);

  const [waiting, active, delayed, failed] = queueCounts;
  const workerUp = workerBeat ? 1 : 0;
  const syncLagSec = oldestSync?.lastSync
    ? Math.max(0, Math.floor((now - oldestSync.lastSync.getTime()) / 1000))
    : -1;

  const body = [
    "# HELP oltflow_olts Number of configured OLTs",
    "# TYPE oltflow_olts gauge",
    line("oltflow_olts", oltCount),
    "# HELP oltflow_onus Number of inventory ONUs",
    "# TYPE oltflow_onus gauge",
    line("oltflow_onus", onuCount),
    "# HELP oltflow_alarms_open Open (uncleared) alarms",
    "# TYPE oltflow_alarms_open gauge",
    line("oltflow_alarms_open", openAlarms),
    line("oltflow_alarms_open", criticalAlarms, { severity: "critical" }),
    "# HELP oltflow_queue_jobs BullMQ job counts by state",
    "# TYPE oltflow_queue_jobs gauge",
    line("oltflow_queue_jobs", waiting, { state: "waiting" }),
    line("oltflow_queue_jobs", active, { state: "active" }),
    line("oltflow_queue_jobs", delayed, { state: "delayed" }),
    line("oltflow_queue_jobs", failed, { state: "failed" }),
    "# HELP oltflow_worker_up 1 if worker heartbeat is fresh",
    "# TYPE oltflow_worker_up gauge",
    line("oltflow_worker_up", workerUp),
    "# HELP oltflow_sync_lag_seconds Seconds since the stalest OLT lastSync (-1 if none)",
    "# TYPE oltflow_sync_lag_seconds gauge",
    line("oltflow_sync_lag_seconds", syncLagSec),
    "",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
