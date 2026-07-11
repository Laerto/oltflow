import { NextResponse } from "next/server";
import {
  prisma,
  SETTING_KEYS,
  SETTING_DEFAULTS,
  setSetting,
  invalidateSettingsCache,
  type SettingKey,
} from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";

const EDITABLE: { key: SettingKey; label: string; group: string; type: "number" | "string" | "boolean" }[] = [
  { key: SETTING_KEYS.signalGoodDbm, label: "Sinjal good (≥ dBm)", group: "signal", type: "number" },
  { key: SETTING_KEYS.signalWarningDbm, label: "Sinjal warning (≥ dBm)", group: "signal", type: "number" },
  { key: SETTING_KEYS.signalDangerDbm, label: "Sinjal danger (≤ dBm)", group: "signal", type: "number" },
  { key: SETTING_KEYS.alarmWeakDbm, label: "Alarm sinjal i dobët (< dBm)", group: "signal", type: "number" },
  { key: SETTING_KEYS.alarmExpiryDays, label: "Alarm skadencë (ditë)", group: "signal", type: "number" },
  { key: SETTING_KEYS.syncIntervalMs, label: "Interval sync (ms)", group: "sync", type: "number" },
  { key: SETTING_KEYS.signalIntervalMs, label: "Interval sinjali (ms)", group: "sync", type: "number" },
  { key: SETTING_KEYS.detailIntervalMs, label: "Interval detail (ms)", group: "sync", type: "number" },
  { key: SETTING_KEYS.alarmIntervalMs, label: "Interval alarme (ms)", group: "sync", type: "number" },
  { key: SETTING_KEYS.retainSignalDays, label: "Ruajtje Signal (ditë)", group: "retain", type: "number" },
  { key: SETTING_KEYS.retainJobDays, label: "Ruajtje Job (ditë)", group: "retain", type: "number" },
  { key: SETTING_KEYS.retainAuditDays, label: "Ruajtje Audit (ditë)", group: "retain", type: "number" },
  { key: SETTING_KEYS.locale, label: "Locale", group: "app", type: "string" },
  { key: SETTING_KEYS.publicSignup, label: "Regjistrim publik (signup)", group: "app", type: "boolean" },
  { key: SETTING_KEYS.appBaseUrl, label: "URL publike (email links)", group: "app", type: "string" },
  { key: SETTING_KEYS.acsMirrorIntervalMs, label: "ACS mirror interval (ms)", group: "acs", type: "number" },
  { key: SETTING_KEYS.acsProvisionCheckMin, label: "ACS post-provision check (min)", group: "acs", type: "number" },
];

export async function GET() {
  const denied = await requirePerm("settings.manage");
  if ("error" in denied && denied.error) return denied.error;

  const rows = await prisma.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const settings = EDITABLE.map((e) => {
    const row = byKey.get(e.key);
    const value = row?.value ?? SETTING_DEFAULTS[e.key];
    return {
      key: e.key,
      label: e.label,
      group: e.group,
      type: e.type,
      value,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ settings });
}

/** Body: { key, value } — updates one setting and invalidates cache. */
export async function PUT(request: Request) {
  const denied = await requirePerm("settings.manage");
  if ("error" in denied && denied.error) return denied.error;
  const session = denied.session!;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string") {
    return NextResponse.json({ error: "Të dhëna të pavlefshme" }, { status: 400 });
  }
  const meta = EDITABLE.find((e) => e.key === body.key);
  if (!meta) return NextResponse.json({ error: "Çelës i panjohur" }, { status: 400 });

  let value: unknown = body.value;
  if (meta.type === "number") {
    value = Number(body.value);
    if (!Number.isFinite(value)) return NextResponse.json({ error: "Vlera duhet të jetë numër" }, { status: 400 });
  } else if (meta.type === "boolean") {
    value = body.value === true || body.value === "true" || body.value === 1 || body.value === "1";
  } else {
    value = String(body.value ?? "");
  }

  await setSetting(meta.key, value, Number(session.sub));
  invalidateSettingsCache();

  await prisma.auditLog
    .create({
      data: {
        userId: Number(session.sub),
        action: "setting_update",
        result: "success",
        payload: { key: meta.key, value: value as string | number | boolean | null },
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true, key: meta.key, value });
}
