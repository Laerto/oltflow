import { prisma, type OpenAlarmInput } from "@oltflow/db";
import type { ChannelTarget, NotifyEvent, NotifyBehavior } from "@oltflow/core";
import { dispatchChannel } from "./channels.js";
import { kv } from "../kv.js";
import { log } from "../logger.js";

/**
 * DB-driven notification engine. For each event, matching enabled rules fire their
 * channels according to behavior (once_until_clear / daily / every), respecting
 * maintenance windows and quiet hours.
 */

const DEDUP_PREFIX = "oltflow:notify:dedup:";
const DAY_SECONDS = 60 * 60 * 25;

interface RuleRow {
  id: number;
  name: string;
  eventType: string;
  severityMin: string | null;
  enabled: boolean;
  scopeAll: boolean;
  oltIds: number[];
  channels: unknown;
  behavior: string;
  quietStart: string | null;
  quietEnd: string | null;
}

function severityRank(s: string | null | undefined): number {
  if (s === "critical") return 3;
  if (s === "warning") return 2;
  if (s === "info") return 1;
  return 0;
}

function inQuietHours(start: string | null, end: string | null, now = new Date()): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const a = sh! * 60 + sm!;
  const b = eh! * 60 + em!;
  if (a === b) return false;
  // Overnight window (e.g. 22:00–07:00)
  if (a > b) return mins >= a || mins < b;
  return mins >= a && mins < b;
}

async function isInMaintenance(oltId: number | null | undefined): Promise<boolean> {
  const now = new Date();
  const win = await prisma.maintenanceWindow.findFirst({
    where: {
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [{ oltId: null }, ...(oltId != null ? [{ oltId }] : [])],
    },
    select: { id: true },
  });
  return Boolean(win);
}

function parseChannels(raw: unknown): ChannelTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === "object" && typeof (c as ChannelTarget).type === "string") as ChannelTarget[];
}

async function shouldFire(
  behavior: NotifyBehavior | string,
  dedupKey: string
): Promise<boolean> {
  if (behavior === "every") return true;
  if (behavior === "daily") {
    const day = new Date().toISOString().slice(0, 10);
    const key = `${DEDUP_PREFIX}daily:${dedupKey}:${day}`;
    const first = await kv.set(key, "1", "EX", DAY_SECONDS, "NX");
    return Boolean(first);
  }
  // once_until_clear
  const key = `${DEDUP_PREFIX}once:${dedupKey}`;
  const first = await kv.set(key, "1", "EX", 60 * 60 * 24 * 30, "NX"); // 30d safety TTL; clear on recovery
  return Boolean(first);
}

/** Clear once_until_clear dedup when condition recovers. */
export async function clearNotifyDedup(alarmKey: string): Promise<void> {
  // Clear for all rules that might have fired this alarm key (wildcard via scan is heavy;
  // we store per ruleId:alarmKey — clear prefix by known pattern from rules).
  const rules = await prisma.notificationRule.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  await Promise.all(
    rules.map((r) => kv.del(`${DEDUP_PREFIX}once:${r.id}:${alarmKey}`).catch(() => {}))
  );
}

export async function notifyEvent(event: NotifyEvent): Promise<number> {
  if (await isInMaintenance(event.oltId ?? null)) {
    await prisma.notificationLog
      .create({
        data: {
          eventType: event.eventType,
          channel: "system",
          status: "skipped",
          error: "maintenance_window",
          alarmKey: event.alarmKey ?? null,
          oltId: event.oltId ?? null,
          onuId: event.onuId ?? null,
        },
      })
      .catch(() => {});
    return 0;
  }

  const rules = (await prisma.notificationRule.findMany({
    where: { enabled: true, eventType: event.eventType },
  })) as RuleRow[];

  let sent = 0;
  for (const rule of rules) {
    if (rule.severityMin && severityRank(event.severity) < severityRank(rule.severityMin)) continue;
    if (!rule.scopeAll && event.oltId != null && !rule.oltIds.includes(event.oltId)) continue;
    if (inQuietHours(rule.quietStart, rule.quietEnd)) {
      await prisma.notificationLog
        .create({
          data: {
            ruleId: rule.id,
            eventType: event.eventType,
            channel: "system",
            status: "skipped",
            error: "quiet_hours",
            alarmKey: event.alarmKey ?? null,
            oltId: event.oltId ?? null,
            onuId: event.onuId ?? null,
          },
        })
        .catch(() => {});
      continue;
    }

    // Must match clearNotifyDedup pattern: once:{ruleId}:{alarmKey}
    const dedupKey = `${rule.id}:${event.alarmKey ?? event.eventType}`;
    if (!(await shouldFire(rule.behavior, dedupKey))) continue;

    const channels = parseChannels(rule.channels);
    for (const ch of channels) {
      const result = await dispatchChannel(ch.type, event, ch);
      await prisma.notificationLog
        .create({
          data: {
            ruleId: rule.id,
            eventType: event.eventType,
            channel: ch.type,
            status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
            error: result.error ?? null,
            target: result.target ?? null,
            alarmKey: event.alarmKey ?? null,
            oltId: event.oltId ?? null,
            onuId: event.onuId ?? null,
            detail: { title: event.title } as object,
          },
        })
        .catch(() => {});
      if (result.ok) sent++;
      else if (!result.skipped) {
        // Allow retry next tick for once_until_clear on failure
        if (rule.behavior === "once_until_clear") {
          await kv.del(`${DEDUP_PREFIX}once:${dedupKey}`).catch(() => {});
        }
        log.warn({ ruleId: rule.id, channel: ch.type, err: result.error }, "notify channel failed");
      }
    }
  }
  return sent;
}

/** Fire notifications for newly opened Alarm rows. */
export async function notifyNewAlarms(inputs: OpenAlarmInput[]): Promise<number> {
  let total = 0;
  for (const a of inputs) {
    const n = await notifyEvent({
      eventType: a.type,
      severity: a.severity === "critical" ? "critical" : "warning",
      title: a.title,
      body: a.detail ?? a.title,
      alarmKey: a.key,
      oltId: a.oltId,
      onuId: a.onuId,
    });
    total += n;
  }
  return total;
}
