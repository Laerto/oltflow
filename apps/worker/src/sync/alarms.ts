import {
  prisma,
  getSignalThresholds,
  openAlarms,
  clearAlarmsExcept,
  type OpenAlarmInput,
  type AlarmType,
} from "@oltflow/db";
import { onuConnectionKind } from "@oltflow/core";
import type { ShelfCard } from "@oltflow/adapters";
import { getRadiusData, normalizeMac } from "../radius.js";
import { kv } from "../kv.js";
import { notifyNewAlarms, clearNotifyDedup } from "../notify/engine.js";

// Flap damping for client.offline: a subscriber's PPPoE session must be missing for this many
// consecutive alarm ticks before we alert, so a briefly-rebooting Mikrotik doesn't cry wolf.
const CLIENT_OFFLINE_MIN_TICKS = 2;

// Optical-signal alarms (weak/danger) are OFF by default: a chronically weak-but-working link
// (-28…-30 dBm) is a health metric, not an actionable incident — as a real-time alarm it just
// floods the NOC and desensitises staff. Signal stays visible (coloured) on the ONU pages. Flip
// SIGNAL_ALARMS_ENABLED=true to restore per-ONU signal alarms.
const SIGNAL_ALARMS_ENABLED = process.env.SIGNAL_ALARMS_ENABLED === "true";

// Individual ONU-offline alarms are OFF by default too: for a residential ISP an ONU going down
// is usually the customer powering it off (the data shows most offline ONUs are "Power Off"/
// "DyingGasp" and can't even be tied to an account), so per-ONU paging just floods. The actionable
// "port / mass down" signal is pon.outage (many ONUs on one port dropping together = fibre cut /
// card fault), which stays on. Flip ONU_OFFLINE_ALARMS_ENABLED=true to restore per-ONU alarms.
const ONU_OFFLINE_ALARMS_ENABLED = process.env.ONU_OFFLINE_ALARMS_ENABLED === "true";

// Expiry is a billing worklist, not a network incident — it already lives in the dashboard
// "Skadojnë" panel and the WhatsApp reminders, so it's OFF as a bell/Telegram alarm by default.
// The Skadojnë panel reads its own data (stats.expiring), so this doesn't affect it. Flip
// EXPIRY_ALARMS_ENABLED=true to restore expiry alarms.
const EXPIRY_ALARMS_ENABLED = process.env.EXPIRY_ALARMS_ENABLED === "true";

/**
 * Alarm tick:
 *  1. SQL-side / chunked scans find ONUs/OLTs/ports that cross thresholds.
 *  2. Persist open/clear transitions in the Alarm table.
 *  3. Fire notification engine for newly opened alarms (rules → Telegram/SMTP/webhook/…).
 */

const PORT_MIN_ONUS = 3;
const PORT_CRITICAL = 0.8;
const PORT_WARNING = 0.5;
const CHUNK = 500;

function whoLabel(o: {
  name: string | null;
  serial: string | null;
  ponPort: string;
  mgmtIp: string | null;
}): string {
  return `${o.name || o.serial || o.ponPort} (${o.serial ?? "-"})${o.mgmtIp ? ` · ${o.mgmtIp}` : ""}`;
}

async function openAndNotify(inputs: OpenAlarmInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  // Enrich Telegram-friendly bodies for classic alarm texts
  const enriched = inputs.map((a) => {
    if (a.type === "onu.offline" && a.detail && !a.detail.includes("🔴")) {
      return {
        ...a,
        // body used by notify is detail; keep title/detail as stored on Alarm
      };
    }
    return a;
  });
  const { newlyOpened } = await openAlarms(enriched);
  // Prefer richer HTML bodies for notifications
  const forNotify = newlyOpened.map((a) => {
    if (a.type === "onu.offline") {
      return {
        ...a,
        detail: `🔴 <b>ONU Offline</b>: ${a.title} — ${a.detail ?? ""}`,
      };
    }
    if (a.type === "onu.signal.warning") {
      return { ...a, detail: `🟠 <b>Sinjal i dobët</b>: ${a.title} — ${a.detail ?? ""}` };
    }
    if (a.type === "onu.signal.danger") {
      return {
        ...a,
        detail: `⚠️🚨 <b>Sinjal në rrezik</b>: ${a.title} — ${a.detail ?? ""} — kontrollo sot!`,
      };
    }
    if (a.type === "onu.expiry") {
      return { ...a, detail: `🟡 <b>Skadencë</b>: ${a.title} — ${a.detail ?? ""}` };
    }
    if (a.type === "olt.unreachable") {
      return { ...a, detail: `🔴 <b>OLT Offline</b>: ${a.title}` };
    }
    if (a.type === "olt.uplink.down") {
      return { ...a, detail: `🔴 <b>Uplink OLT jashtë pune</b> (backhaul) — ${a.title}: ${a.detail ?? ""}` };
    }
    if (a.type === "pon.outage") {
      return { ...a, detail: `🟠 <b>PON outage</b>: ${a.title}` };
    }
    if (a.type === "client.offline") {
      return { ...a, detail: `📴 <b>Klient offline</b> (ONU online, PPPoE i rënë) — ${a.title}: ${a.detail ?? ""}` };
    }
    return a;
  });
  return notifyNewAlarms(forNotify);
}

/** Clear notify dedup for recovered alarm keys. */
async function clearRecovered(type: AlarmType, stillActive: Set<string>): Promise<void> {
  const open = await prisma.alarm.findMany({
    where: { type, clearedAt: null },
    select: { key: true },
  });
  // After clearAlarmsExcept, keys not in stillActive are cleared — find those
  // by comparing before clear is awkward; instead clear dedup for keys we know recovered:
  // call this AFTER clearAlarmsExcept by finding recently cleared.
  void open;
  void stillActive;
}

export async function checkAlarms(): Promise<number> {
  const thresholds = await getSignalThresholds();
  const now = Date.now();
  const expiryCutoff = new Date(now + thresholds.expiryDays * 86_400_000);

  let notified = 0;
  const activeKeys = new Map<AlarmType, Set<string>>();
  const mark = (type: AlarmType, key: string) => {
    let s = activeKeys.get(type);
    if (!s) {
      s = new Set();
      activeKeys.set(type, s);
    }
    s.add(key);
  };

  // ── 1) Offline OLTs ──────────────────────────────────────────────────────
  const offlineOlts = await prisma.olt.findMany({
    where: { status: "offline" },
    select: { id: true, name: true },
  });
  const offlineOltIds = new Set(offlineOlts.map((o) => o.id));
  const oltInputs: OpenAlarmInput[] = offlineOlts.map((o) => {
    const key = `olt.unreachable:${o.id}`;
    mark("olt.unreachable", key);
    return {
      key,
      type: "olt.unreachable",
      severity: "critical",
      oltId: o.id,
      title: `${o.name} — OLT pa lidhje`,
      detail: "Power off ose s'arrihet nga rrjeti",
      href: "/olts",
    };
  });
  notified += await openAndNotify(oltInputs);
  {
    const before = await prisma.alarm.findMany({
      where: { type: "olt.unreachable", clearedAt: null },
      select: { key: true },
    });
    await clearAlarmsExcept("olt.unreachable", activeKeys.get("olt.unreachable") ?? new Set());
    const still = activeKeys.get("olt.unreachable") ?? new Set();
    for (const a of before) {
      if (!still.has(a.key)) await clearNotifyDedup(a.key);
    }
  }

  // RADIUS snapshot (shared by the offline + client-offline sections). Null when RADIUS is
  // unreachable → we then skip the expired/disabled filtering rather than risk hiding real outages.
  const radius = await getRadiusData();
  // An offline ONU whose subscriber account is expired or disabled is EXPECTED to be down
  // (seasonal/unpaid) — not an incident. Only unexpected outages of active clients should alarm.
  const isLegitOff = (o: { pppoeUser: string | null; radiusUser: string | null }): boolean => {
    if (!radius) return false;
    const user = o.pppoeUser || o.radiusUser;
    if (!user) return false;
    const client = radius.byUsername.get(user);
    if (!client) return false;
    return Boolean((client.expiration && client.expiration.getTime() < Date.now()) || client.enabled === false);
  };

  // ── 2) Offline ONUs ──────────────────────────────────────────────────────
  // Generation gated by ONU_OFFLINE_ALARMS_ENABLED (default off). The clear pass below always runs,
  // so when off any previously-open onu.offline alarms are cleared out on the next tick.
  let cursor = 0;
  for (; ONU_OFFLINE_ALARMS_ENABLED; ) {
    const rows = await prisma.onu.findMany({
      where: {
        id: { gt: cursor },
        AND: [{ state: { not: null } }, { NOT: { state: "working" } }],
        ...(offlineOltIds.size ? { oltId: { notIn: [...offlineOltIds] } } : {}),
      },
      orderBy: { id: "asc" },
      take: CHUNK,
      select: {
        id: true,
        name: true,
        serial: true,
        state: true,
        mgmtIp: true,
        ponPort: true,
        oltId: true,
        pppoeUser: true,
        radiusUser: true,
        olt: { select: { name: true } },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    const inputs: OpenAlarmInput[] = [];
    for (const o of rows) {
      if (isLegitOff(o)) continue; // expired/disabled account → expected down, don't alarm
      const key = `onu.offline:${o.id}`;
      mark("onu.offline", key);
      inputs.push({
        key,
        type: "onu.offline" as const,
        severity: "critical" as const,
        oltId: o.oltId,
        onuId: o.id,
        title: `${o.name || o.ponPort} — offline`,
        detail: `${o.olt.name} · ${o.state ?? "offline"} · ${whoLabel(o)}`,
        href: `/onus/${o.id}`,
      });
    }
    notified += await openAndNotify(inputs);
    if (rows.length < CHUNK) break;
  }
  {
    const before = await prisma.alarm.findMany({
      where: { type: "onu.offline", clearedAt: null },
      select: { key: true },
    });
    await clearAlarmsExcept("onu.offline", activeKeys.get("onu.offline") ?? new Set());
    const still = activeKeys.get("onu.offline") ?? new Set();
    for (const a of before) {
      if (!still.has(a.key)) await clearNotifyDedup(a.key);
    }
  }

  // ── Client offline behind an ONLINE ONU (bridge Mikrotik / route PPPoE dropped) ──────────
  // The blind spot: the ONU is `working` (PON up) so support thinks the client is fine, but the
  // subscriber's PPPoE session is down (bridge Mikrotik powered off / line dropped). We detect it
  // from RADIUS: an online ONU that is EXPECTED to carry a session (route → has pppoeUser; bridge →
  // has learned a downstream MAC and had an IP before) but currently has NO active session.
  // getRadiusData() returns null if RADIUS is unreachable → skip entirely (never false-alarm on a
  // RADIUS outage).
  {
    if (radius) {
      const inputs: OpenAlarmInput[] = [];
      let c = 0;
      for (;;) {
        const rows = await prisma.onu.findMany({
          where: {
            id: { gt: c },
            state: "working",
            ...(offlineOltIds.size ? { oltId: { notIn: [...offlineOltIds] } } : {}),
          },
          orderBy: { id: "asc" },
          take: CHUNK,
          select: { id: true, name: true, serial: true, ponPort: true, oltId: true, type: true, mac: true, mgmtIp: true, pppoeUser: true, radiusUser: true, olt: { select: { name: true } } },
        });
        if (rows.length === 0) break;
        c = rows[rows.length - 1]!.id;
        for (const o of rows) {
          const kind = onuConnectionKind(o.type);
          const macKey = o.mac ? normalizeMac(o.mac) : "";
          const session = macKey ? radius.byMac.get(macKey) : undefined;
          // Resolve the subscriber: active session first, else the sticky remembered username (so a
          // DOWN bridge session — which loses the MAC→user link — still resolves to its account).
          const user = o.pppoeUser || session?.username || o.radiusUser || null;
          const client = user ? radius.byUsername.get(user) : undefined;
          const hasSession = kind === "bridge" ? Boolean(session?.liveIp) : Boolean(client?.liveIp || session?.liveIp);
          // Skip accounts that are LEGITIMATELY off — expired or disabled in RADIUS — so we don't
          // cry wolf over seasonal/unpaid clients (only unexpected outages of active clients alarm).
          const legitOff = Boolean(client && ((client.expiration && client.expiration.getTime() < Date.now()) || client.enabled === false));
          // Expected to carry a session: route with a pppoeUser, or a bridge ONU seen up before
          // (sticky mgmtIp + learned MAC). Must know the account and it must be active.
          const expected =
            Boolean(user) &&
            !legitOff &&
            (kind === "route" ? Boolean(o.pppoeUser) : Boolean(o.mgmtIp && o.mac));
          const cntKey = `client-off-cnt:${o.id}`;
          if (expected && !hasSession) {
            // Confirm the outage across consecutive ticks before alarming (flap damping).
            const cnt = await kv.incr(cntKey).catch(() => CLIENT_OFFLINE_MIN_TICKS);
            await kv.expire(cntKey, 900).catch(() => {});
            if (cnt >= CLIENT_OFFLINE_MIN_TICKS) {
              const key = `client.offline:${o.id}`;
              mark("client.offline", key);
              inputs.push({
                key,
                type: "client.offline" as const,
                severity: "critical" as const,
                oltId: o.oltId,
                onuId: o.id,
                title: `${o.name || o.ponPort} — klient offline`,
                detail: `${o.olt.name} · ONU online por PPPoE i rënë${o.mgmtIp ? ` · ${o.mgmtIp}` : ""}${user ? ` · ${user}` : ""}`,
                href: `/onus/${o.id}`,
              });
            }
          } else if (hasSession) {
            // Recovered (or never down) → reset the streak so a future blip needs the full count.
            await kv.del(cntKey).catch(() => {});
          }
        }
        if (rows.length < CHUNK) break;
      }
      notified += await openAndNotify(inputs);
      await clearAlarmsExcept("client.offline", activeKeys.get("client.offline") ?? new Set());
    }
  }

  // ── 3) Weak / danger signal ──────────────────────────────────────────────
  // Generation gated by SIGNAL_ALARMS_ENABLED (default off). The clear pass below always runs, so
  // when the flag is off any previously-open signal alarms are cleared out on the next tick.
  cursor = 0;
  for (; SIGNAL_ALARMS_ENABLED; ) {
    const rows = await prisma.onu.findMany({
      where: {
        id: { gt: cursor },
        state: "working",
        lastOnuRx: { not: null, lt: thresholds.weakAlarm },
        ...(offlineOltIds.size ? { oltId: { notIn: [...offlineOltIds] } } : {}),
      },
      orderBy: { id: "asc" },
      take: CHUNK,
      select: {
        id: true,
        name: true,
        serial: true,
        mgmtIp: true,
        ponPort: true,
        oltId: true,
        lastOnuRx: true,
        olt: { select: { name: true } },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    const weakInputs: OpenAlarmInput[] = [];
    const dangerInputs: OpenAlarmInput[] = [];
    for (const o of rows) {
      const rx = o.lastOnuRx!;
      const weakKey = `onu.signal.warning:${o.id}`;
      mark("onu.signal.warning", weakKey);
      weakInputs.push({
        key: weakKey,
        type: "onu.signal.warning",
        severity: "warning",
        oltId: o.oltId,
        onuId: o.id,
        title: `${o.name || o.ponPort} — ${rx} dBm`,
        detail: `${o.olt.name} · sinjal i dobët · ${whoLabel(o)}`,
        href: `/onus/${o.id}`,
      });
      if (rx <= thresholds.danger) {
        const dangerKey = `onu.signal.danger:${o.id}`;
        mark("onu.signal.danger", dangerKey);
        dangerInputs.push({
          key: dangerKey,
          type: "onu.signal.danger",
          severity: "critical",
          oltId: o.oltId,
          onuId: o.id,
          title: `${o.name || o.ponPort} — ${rx} dBm`,
          detail: `${o.olt.name} · ≤ ${thresholds.danger} dBm · ${whoLabel(o)}`,
          href: `/onus/${o.id}`,
        });
      }
    }
    notified += await openAndNotify(weakInputs);
    notified += await openAndNotify(dangerInputs);
    if (rows.length < CHUNK) break;
  }
  for (const type of ["onu.signal.warning", "onu.signal.danger"] as AlarmType[]) {
    const before = await prisma.alarm.findMany({
      where: { type, clearedAt: null },
      select: { key: true },
    });
    await clearAlarmsExcept(type, activeKeys.get(type) ?? new Set());
    const still = activeKeys.get(type) ?? new Set();
    for (const a of before) {
      if (!still.has(a.key)) await clearNotifyDedup(a.key);
    }
  }

  // ── 4) Expiry ────────────────────────────────────────────────────────────
  // Generation gated by EXPIRY_ALARMS_ENABLED (default off); the clear pass below always runs so
  // previously-open expiry alarms are purged. Expiry still shows in the dashboard "Skadojnë" panel.
  cursor = 0;
  for (; EXPIRY_ALARMS_ENABLED; ) {
    const rows = await prisma.onu.findMany({
      where: { id: { gt: cursor }, expiration: { lte: expiryCutoff } },
      orderBy: { id: "asc" },
      take: CHUNK,
      select: {
        id: true,
        name: true,
        serial: true,
        mgmtIp: true,
        ponPort: true,
        oltId: true,
        expiration: true,
        olt: { select: { name: true } },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    const inputs: OpenAlarmInput[] = [];
    for (const o of rows) {
      if (!o.expiration) continue;
      const days = Math.floor((o.expiration.getTime() - now) / 86_400_000);
      const key = `onu.expiry:${o.id}`;
      mark("onu.expiry", key);
      const when = days < 0 ? `skadoi ${-days} ditë më parë` : `skadon pas ${days} ditë`;
      inputs.push({
        key,
        type: "onu.expiry",
        severity: days < 0 ? "critical" : "warning",
        oltId: o.oltId,
        onuId: o.id,
        title: `${o.name || o.ponPort} — skadencë`,
        detail: `${o.olt.name} · ${when} · ${whoLabel(o)}`,
        href: `/onus/${o.id}`,
      });
    }
    notified += await openAndNotify(inputs);
    if (rows.length < CHUNK) break;
  }
  {
    const before = await prisma.alarm.findMany({
      where: { type: "onu.expiry", clearedAt: null },
      select: { key: true },
    });
    await clearAlarmsExcept("onu.expiry", activeKeys.get("onu.expiry") ?? new Set());
    const still = activeKeys.get("onu.expiry") ?? new Set();
    for (const a of before) {
      if (!still.has(a.key)) await clearNotifyDedup(a.key);
    }
  }

  // ── 5) PON-port outages ──────────────────────────────────────────────────
  const portRows = await prisma.$queryRaw<
    { olt_id: number; olt_name: string; port: string; total: bigint; offline: bigint }[]
  >`
    SELECT
      t.olt_id,
      t.olt_name,
      t.port,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE t.state IS NOT NULL AND t.state <> 'working')::bigint AS offline
    FROM (
      SELECT
        o."oltId" AS olt_id,
        l.name AS olt_name,
        o.state AS state,
        regexp_replace(
          regexp_replace(
            regexp_replace(o."ponPort", ':[0-9]+$', ''),
            '^gpon-onu_', 'gpon-olt_'
          ),
          '^epon-onu_', 'epon-olt_'
        ) AS port
      FROM "Onu" o
      JOIN "Olt" l ON l.id = o."oltId"
      WHERE l.status IS DISTINCT FROM 'offline'
    ) t
    GROUP BY t.olt_id, t.olt_name, t.port
    HAVING count(*) >= ${PORT_MIN_ONUS}
      AND count(*) FILTER (WHERE t.state IS NOT NULL AND t.state <> 'working')::float
          / count(*)::float >= ${PORT_WARNING}
  `;

  const portInputs: OpenAlarmInput[] = [];
  for (const p of portRows) {
    const total = Number(p.total);
    const offline = Number(p.offline);
    const ratio = offline / total;
    const key = `pon.outage:${p.olt_id}:${p.port}`;
    mark("pon.outage", key);
    const shortPort = p.port.replace("gpon-olt_", "").replace("epon-olt_", "");
    portInputs.push({
      key,
      type: "pon.outage",
      severity: ratio >= PORT_CRITICAL ? "critical" : "warning",
      oltId: p.olt_id,
      title: `${p.olt_name} · porti ${shortPort} — ${offline}/${total} ONU offline`,
      detail: "Mundësi problem karte/fibri (blast radius)",
      href: "/onus",
      detailJson: { port: p.port, total, offline, ratio },
    });
  }
  notified += await openAndNotify(portInputs);
  {
    const before = await prisma.alarm.findMany({
      where: { type: "pon.outage", clearedAt: null },
      select: { key: true },
    });
    await clearAlarmsExcept("pon.outage", activeKeys.get("pon.outage") ?? new Set());
    const still = activeKeys.get("pon.outage") ?? new Set();
    for (const a of before) {
      if (!still.has(a.key)) await clearNotifyDedup(a.key);
    }
  }

  // ── OLT uplink out of service (backhaul down) ────────────────────────────────
  // The GE/10GE uplink is the OLT's path to the core: if it drops, every client behind the
  // OLT loses internet even while the OLT itself may still answer management (so olt.unreachable
  // stays silent). Read from the periodic shelf snapshot (Olt.shelf). To avoid crying wolf over
  // spare SFPs left plugged in, only uplinks SEEN UP at least once are monitored (learned in
  // Redis with a TTL) — a port that was never up never alarms. A once-up uplink that drops stays
  // alarmed until it recovers (or the learn key expires after ~14 days of being down).
  {
    const UPLINK_SEEN_TTL = 14 * 86_400; // seconds a once-up uplink stays "monitored"
    const olts = await prisma.olt.findMany({ select: { id: true, name: true, status: true, shelf: true } });
    const inputs: OpenAlarmInput[] = [];
    for (const olt of olts) {
      if (olt.status === "offline") continue; // a fully-dead OLT is covered by olt.unreachable
      const snap = olt.shelf as { cards?: ShelfCard[] } | null;
      if (!snap?.cards) continue;
      for (const card of snap.cards) {
        if (card.role !== "uplink-xge" && card.role !== "uplink-ge") continue;
        for (const u of card.uplinks ?? []) {
          if (!u.present) continue; // empty cage — nothing to monitor
          const seenKey = `uplink:seen:${olt.id}:${u.name}`;
          // Healthy = link up and Rx above the module's own lower alarm threshold (LOS floor).
          const healthy = u.up !== false && (u.rxPower == null || u.rxLower == null || u.rxPower > u.rxLower);
          if (healthy) {
            await kv.set(seenKey, String(now)).catch(() => {});
            await kv.expire(seenKey, UPLINK_SEEN_TTL).catch(() => {});
            continue;
          }
          const wasActive = Boolean(await kv.get(seenKey).catch(() => null));
          if (!wasActive) continue; // never seen up ⇒ spare/unused SFP, do not alarm
          const key = `olt.uplink.down:${olt.id}:${u.name}`;
          mark("olt.uplink.down", key);
          const rx = u.rxPower == null ? "—" : `${u.rxPower} dbm`;
          const band = card.role === "uplink-xge" ? "10GE" : "GE";
          inputs.push({
            key,
            type: "olt.uplink.down",
            severity: "critical",
            oltId: olt.id,
            title: `${olt.name} · uplink ${u.name} (${band}) — jashtë pune`,
            detail: `${u.moduleType ?? "modul"} · Rx ${rx}${u.rxLower != null ? ` (prag ${u.rxLower})` : ""} · link ${u.up === false ? "DOWN" : "up"}`,
            href: `/olts/${olt.id}`,
            detailJson: { name: u.name, rxPower: u.rxPower, up: u.up, rxLower: u.rxLower },
          });
        }
      }
    }
    notified += await openAndNotify(inputs);
    {
      const before = await prisma.alarm.findMany({ where: { type: "olt.uplink.down", clearedAt: null }, select: { key: true } });
      await clearAlarmsExcept("olt.uplink.down", activeKeys.get("olt.uplink.down") ?? new Set());
      const still = activeKeys.get("olt.uplink.down") ?? new Set();
      for (const a of before) {
        if (!still.has(a.key)) await clearNotifyDedup(a.key);
      }
    }
  }

  void clearRecovered;
  return notified;
}
