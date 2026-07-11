import type { Prisma } from "@prisma/client";
import { prisma } from "./client.js";

/**
 * DB-backed runtime settings with a short in-process cache so the worker/web don't
 * hit Postgres on every alarm tick / page load. Defaults match today's env-backed
 * behaviour; env vars still win as bootstrap overrides until an admin writes a row.
 *
 * Keys are stable string ids — the Phase 2 /admin/settings UI edits these.
 */

export const SETTING_KEYS = {
  signalGoodDbm: "signal.good_dbm",
  signalWarningDbm: "signal.warning_dbm",
  signalCriticalDbm: "signal.critical_dbm", // same as warning floor for classifySignal
  signalDangerDbm: "signal.danger_dbm",
  alarmWeakDbm: "alarm.weak_dbm",
  alarmExpiryDays: "alarm.expiry_days",
  syncIntervalMs: "sync.interval_ms",
  signalIntervalMs: "sync.signal_interval_ms",
  detailIntervalMs: "sync.detail_interval_ms",
  alarmIntervalMs: "sync.alarm_interval_ms",
  retainSignalDays: "retain.signal_days",
  retainJobDays: "retain.job_days",
  retainAuditDays: "retain.audit_days",
  locale: "app.locale",
  publicSignup: "app.public_signup", // boolean as JSON true/false
  appBaseUrl: "app.base_url", // e.g. https://noc.example.com
  acsMirrorIntervalMs: "acs.mirror_interval_ms",
  acsProvisionCheckMin: "acs.provision_check_min",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Defaults when no Setting row (and no env override) exists. */
export const SETTING_DEFAULTS: Record<SettingKey, number | string | boolean> = {
  [SETTING_KEYS.signalGoodDbm]: -25,
  [SETTING_KEYS.signalWarningDbm]: -27,
  [SETTING_KEYS.signalCriticalDbm]: -27,
  [SETTING_KEYS.signalDangerDbm]: -30,
  [SETTING_KEYS.alarmWeakDbm]: -27,
  [SETTING_KEYS.alarmExpiryDays]: 7,
  [SETTING_KEYS.syncIntervalMs]: 60_000,
  [SETTING_KEYS.signalIntervalMs]: 300_000,
  [SETTING_KEYS.detailIntervalMs]: 900_000,
  [SETTING_KEYS.alarmIntervalMs]: 120_000,
  [SETTING_KEYS.retainSignalDays]: 30,
  [SETTING_KEYS.retainJobDays]: 7,
  [SETTING_KEYS.retainAuditDays]: 180,
  [SETTING_KEYS.locale]: "sq-AL",
  [SETTING_KEYS.publicSignup]: false,
  [SETTING_KEYS.appBaseUrl]: "",
  [SETTING_KEYS.acsMirrorIntervalMs]: 900_000, // 15 min
  [SETTING_KEYS.acsProvisionCheckMin]: 15,
};

/** Env bootstrap overrides — applied once when resolving a key that has no DB row. */
const ENV_OVERRIDES: Partial<Record<SettingKey, string | undefined>> = {
  [SETTING_KEYS.signalDangerDbm]: process.env.SIGNAL_DANGER_DBM,
  [SETTING_KEYS.alarmWeakDbm]: process.env.SIGNAL_ALARM_DBM,
  [SETTING_KEYS.syncIntervalMs]: process.env.SYNC_INTERVAL_MS,
  [SETTING_KEYS.signalIntervalMs]: process.env.SIGNAL_INTERVAL_MS,
  [SETTING_KEYS.detailIntervalMs]: process.env.DETAIL_INTERVAL_MS,
  [SETTING_KEYS.alarmIntervalMs]: process.env.ALARM_INTERVAL_MS,
  [SETTING_KEYS.retainSignalDays]: process.env.SIGNAL_RETAIN_DAYS,
  [SETTING_KEYS.retainJobDays]: process.env.JOB_RETAIN_DAYS,
  [SETTING_KEYS.retainAuditDays]: process.env.AUDIT_RETAIN_DAYS,
  [SETTING_KEYS.appBaseUrl]: process.env.APP_BASE_URL ?? process.env.APP_URL,
};

const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_MS ?? 15_000);

interface CacheEntry {
  expires: number;
  values: Map<string, unknown>;
}

let cache: CacheEntry | null = null;

function envNumber(key: SettingKey): number | undefined {
  const raw = ENV_OVERRIDES[key];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function envString(key: SettingKey): string | undefined {
  const raw = ENV_OVERRIDES[key];
  return raw === undefined || raw === "" ? undefined : raw;
}

async function loadAll(): Promise<Map<string, unknown>> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.values;

  const rows = await prisma.setting.findMany();
  const values = new Map<string, unknown>();
  for (const r of rows) values.set(r.key, r.value);
  cache = { expires: now + CACHE_TTL_MS, values };
  return values;
}

/** Invalidate the in-process cache (call after admin writes). */
export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSetting<T = unknown>(key: SettingKey): Promise<T> {
  const all = await loadAll();
  if (all.has(key)) return all.get(key) as T;

  const def = SETTING_DEFAULTS[key];
  if (typeof def === "number") {
    return (envNumber(key) ?? def) as T;
  }
  return (envString(key) ?? def) as T;
}

export async function getNumberSetting(key: SettingKey): Promise<number> {
  const v = await getSetting<unknown>(key);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : (SETTING_DEFAULTS[key] as number);
}

export async function getStringSetting(key: SettingKey): Promise<string> {
  const v = await getSetting<unknown>(key);
  return typeof v === "string" ? v : String(SETTING_DEFAULTS[key] ?? "");
}

export async function getBooleanSetting(key: SettingKey): Promise<boolean> {
  const v = await getSetting<unknown>(key);
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return Boolean(SETTING_DEFAULTS[key]);
}

/** Signal thresholds used by classifySignal-equivalent paths and the alarm tick. */
export async function getSignalThresholds(): Promise<{
  good: number;
  warning: number;
  danger: number;
  weakAlarm: number;
  expiryDays: number;
}> {
  const [good, warning, danger, weakAlarm, expiryDays] = await Promise.all([
    getNumberSetting(SETTING_KEYS.signalGoodDbm),
    getNumberSetting(SETTING_KEYS.signalWarningDbm),
    getNumberSetting(SETTING_KEYS.signalDangerDbm),
    getNumberSetting(SETTING_KEYS.alarmWeakDbm),
    getNumberSetting(SETTING_KEYS.alarmExpiryDays),
  ]);
  return { good, warning, danger, weakAlarm, expiryDays };
}

export async function setSetting(
  key: SettingKey | string,
  value: unknown,
  updatedById?: number | null
): Promise<void> {
  const json = value as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: json, updatedById: updatedById ?? null },
    update: { value: json, updatedById: updatedById ?? null },
  });
  invalidateSettingsCache();
}

/** Seed missing keys with defaults (idempotent). Safe to call on worker boot. */
export async function ensureDefaultSettings(): Promise<number> {
  let created = 0;
  for (const [key, def] of Object.entries(SETTING_DEFAULTS)) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (existing) continue;
    const env = ENV_OVERRIDES[key as SettingKey];
    let value: Prisma.InputJsonValue = def as Prisma.InputJsonValue;
    if (env !== undefined && env !== "") {
      value = (typeof def === "number" ? Number(env) : env) as Prisma.InputJsonValue;
    }
    await prisma.setting.create({ data: { key, value } });
    created++;
  }
  if (created) invalidateSettingsCache();
  return created;
}
