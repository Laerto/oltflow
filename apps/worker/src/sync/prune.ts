import { prisma, getNumberSetting, SETTING_KEYS } from "@oltflow/db";

// Retention windows (DB settings with env bootstrap). Signals feed the history graph;
// jobs/audit are logs. PonTraffic prunes itself in pon-traffic.ts (24h).
const DAY = 24 * 60 * 60 * 1000;

export async function pruneOldData(): Promise<{ signals: number; jobs: number; audit: number }> {
  const [signalDays, jobDays, auditDays] = await Promise.all([
    getNumberSetting(SETTING_KEYS.retainSignalDays),
    getNumberSetting(SETTING_KEYS.retainJobDays),
    getNumberSetting(SETTING_KEYS.retainAuditDays),
  ]);
  const now = Date.now();
  const [signals, jobs, audit] = await Promise.all([
    prisma.signal.deleteMany({ where: { recordedAt: { lt: new Date(now - signalDays * DAY) } } }),
    // Only finished jobs — never delete queued/active work.
    prisma.job.deleteMany({
      where: { status: { in: ["done", "failed"] }, createdAt: { lt: new Date(now - jobDays * DAY) } },
    }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now - auditDays * DAY) } } }),
  ]);
  return { signals: signals.count, jobs: jobs.count, audit: audit.count };
}
