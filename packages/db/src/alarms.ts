import { prisma } from "./client.js";

/**
 * Helpers for the persisted Alarm store. The worker opens/refreshes/clears rows each
 * tick; the web layer only reads (and later acks/silences). `key` is the stable
 * open-alarm identity so re-ticks update lastSeenAt instead of duplicating rows.
 */

export type AlarmType =
  | "onu.offline"
  | "onu.signal.warning"
  | "onu.signal.danger"
  | "onu.expiry"
  | "olt.unreachable"
  | "pon.outage"
  | "client.offline";

export type AlarmSeverity = "critical" | "warning";

export interface OpenAlarmInput {
  key: string;
  type: AlarmType;
  severity: AlarmSeverity;
  oltId?: number | null;
  onuId?: number | null;
  title: string;
  detail?: string | null;
  href?: string | null;
  detailJson?: unknown;
}

/** Open a new alarm or refresh lastSeenAt (and title/detail) if already open. */
export async function openAlarm(input: OpenAlarmInput): Promise<"opened" | "refreshed"> {
  const existing = await prisma.alarm.findUnique({ where: { key: input.key } });
  if (existing && !existing.clearedAt) {
    await prisma.alarm.update({
      where: { key: input.key },
      data: {
        lastSeenAt: new Date(),
        title: input.title,
        detail: input.detail ?? existing.detail,
        href: input.href ?? existing.href,
        severity: input.severity,
        // Re-open after silence expires is handled by the reader; keep silence until admin clears.
      },
    });
    return "refreshed";
  }

  // Re-open a previously cleared alarm as a fresh open row (same key).
  await prisma.alarm.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      type: input.type,
      severity: input.severity,
      oltId: input.oltId ?? null,
      onuId: input.onuId ?? null,
      title: input.title,
      detail: input.detail ?? null,
      href: input.href ?? null,
      detailJson: input.detailJson as object | undefined,
    },
    update: {
      type: input.type,
      severity: input.severity,
      oltId: input.oltId ?? null,
      onuId: input.onuId ?? null,
      title: input.title,
      detail: input.detail ?? null,
      href: input.href ?? null,
      detailJson: input.detailJson as object | undefined,
      openedAt: new Date(),
      clearedAt: null,
      lastSeenAt: new Date(),
      ackedAt: null,
      ackedById: null,
      silencedUntil: null,
    },
  });
  return "opened";
}

/** Mark an open alarm cleared. No-op if already cleared or missing. */
export async function clearAlarm(key: string): Promise<boolean> {
  const res = await prisma.alarm.updateMany({
    where: { key, clearedAt: null },
    data: { clearedAt: new Date() },
  });
  return res.count > 0;
}

/** Clear every open alarm whose key is not in `stillActive`. Used after a full tick
 * so recovered conditions disappear without enumerating every possible key. */
export async function clearAlarmsExcept(
  type: AlarmType | AlarmType[],
  stillActiveKeys: Set<string>
): Promise<number> {
  const types = Array.isArray(type) ? type : [type];
  const open = await prisma.alarm.findMany({
    where: { type: { in: types }, clearedAt: null },
    select: { key: true },
  });
  const toClear = open.map((a) => a.key).filter((k) => !stillActiveKeys.has(k));
  if (toClear.length === 0) return 0;
  // Chunk so we don't blow the query size with huge fleets.
  let cleared = 0;
  for (let i = 0; i < toClear.length; i += 500) {
    const chunk = toClear.slice(i, i + 500);
    const res = await prisma.alarm.updateMany({
      where: { key: { in: chunk }, clearedAt: null },
      data: { clearedAt: new Date() },
    });
    cleared += res.count;
  }
  return cleared;
}

/** Batch open many alarms (bounded concurrency). Returns newly opened inputs (for notify). */
export async function openAlarms(
  inputs: OpenAlarmInput[]
): Promise<{ opened: number; newlyOpened: OpenAlarmInput[] }> {
  const newlyOpened: OpenAlarmInput[] = [];
  const batchSize = 50;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (inp) => ({ inp, status: await openAlarm(inp) })));
    for (const r of results) {
      if (r.status === "opened") newlyOpened.push(r.inp);
    }
  }
  return { opened: newlyOpened.length, newlyOpened };
}
