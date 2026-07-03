import { prisma } from "@oltflow/db";

// Retention windows (env-overridable). Signals feed the history graph; jobs/audit are logs.
// PonTraffic prunes itself in pon-traffic.ts (24h). Everything else is bounded here so the
// DB stays healthy as the ONU count grows across more OLTs.
const DAY = 24 * 60 * 60 * 1000;
const SIGNAL_RETAIN_DAYS = Number(process.env.SIGNAL_RETAIN_DAYS ?? 30);
const JOB_RETAIN_DAYS = Number(process.env.JOB_RETAIN_DAYS ?? 7);
const AUDIT_RETAIN_DAYS = Number(process.env.AUDIT_RETAIN_DAYS ?? 180);

export async function pruneOldData(): Promise<{ signals: number; jobs: number; audit: number }> {
  const now = Date.now();
  const [signals, jobs, audit] = await Promise.all([
    prisma.signal.deleteMany({ where: { recordedAt: { lt: new Date(now - SIGNAL_RETAIN_DAYS * DAY) } } }),
    // Only finished jobs — never delete queued/active work.
    prisma.job.deleteMany({ where: { status: { in: ["done", "failed"] }, createdAt: { lt: new Date(now - JOB_RETAIN_DAYS * DAY) } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now - AUDIT_RETAIN_DAYS * DAY) } } }),
  ]);
  return { signals: signals.count, jobs: jobs.count, audit: audit.count };
}
