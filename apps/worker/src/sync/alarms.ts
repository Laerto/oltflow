import { prisma } from "@oltflow/db";
import { sendTelegram, telegramConfigured } from "../telegram.js";
import { kv } from "../kv.js";

// Fires a Telegram alert once per (ONU, alarm-type) and won't repeat until the
// condition clears — so a persistently-offline ONU doesn't spam every tick.
// The dedup set lives in Redis (not process memory) so a worker restart/deploy
// doesn't re-fire an alert for every ONU that's still in the same bad state.
// Alarm types per spec: offline, weak signal (< -27 dBm), expiry within 7 days.
type AlarmType = "offline" | "signal" | "expiry";
const ACTIVE_SET_KEY = "oltflow:alarm:active"; // members: `${onuId}:${type}`
const SIGNAL_ALARM_DBM = -27;
// Danger line: a client whose Rx has sunk to ≈ -30 dBm is close to dropping. Unlike the
// fire-once weak-signal alert, this one nags once every calendar day until it's fixed.
const SIGNAL_DANGER_DBM = Number(process.env.SIGNAL_DANGER_DBM ?? -30);
const DAY_SECONDS = 60 * 60 * 25; // 25h key TTL so the once-a-day guard always spans to the next run
const EXPIRY_ALARM_DAYS = 7;

export async function checkAlarms(): Promise<number> {
  if (!telegramConfigured()) return 0;

  const onus = await prisma.onu.findMany({
    select: {
      id: true, name: true, serial: true, state: true, mgmtIp: true, expiration: true, ponPort: true,
      olt: { select: { name: true } },
      signals: { orderBy: { recordedAt: "desc" }, take: 1, select: { onuRx: true } },
    },
  });

  const now = Date.now();
  let sent = 0;
  const fire = async (id: number, type: AlarmType, text: string) => {
    const key = `${id}:${type}`;
    const isNew = await kv.sadd(ACTIVE_SET_KEY, key);
    if (!isNew) return; // already alerted, still active
    if (await sendTelegram(text)) {
      sent++;
    } else {
      // Send failed (Telegram down / rate limited) — un-mark so the next tick retries.
      await kv.srem(ACTIVE_SET_KEY, key).catch(() => {});
    }
  };
  const clear = async (id: number, type: AlarmType) => {
    await kv.srem(ACTIVE_SET_KEY, `${id}:${type}`);
  };
  // Once-a-day "flash": a per-day Redis key (NX) means the danger alert fires at most once per
  // calendar day per ONU, and again the next day if the client is still bad.
  const day = new Date().toISOString().slice(0, 10);
  const fireDaily = async (id: number, text: string) => {
    const key = `oltflow:alarm:danger:${id}:${day}`;
    const first = await kv.set(key, "1", "EX", DAY_SECONDS, "NX");
    if (!first) return; // already flashed today
    if (await sendTelegram(text)) sent++;
    else await kv.del(key).catch(() => {}); // send failed — let a later tick retry today
  };

  for (const o of onus) {
    const who = `${o.name || o.serial || o.ponPort} (${o.serial ?? "-"})${o.mgmtIp ? ` · ${o.mgmtIp}` : ""}`;
    const olt = o.olt.name;

    // Offline
    if (o.state && o.state !== "working") {
      await fire(o.id, "offline", `🔴 <b>ONU Offline</b>: ${who} — OLT ${olt}`);
    } else if (o.state === "working") {
      await clear(o.id, "offline");
    }

    // Weak signal
    const rx = o.signals[0]?.onuRx ?? null;
    if (rx !== null && rx < SIGNAL_ALARM_DBM) {
      await fire(o.id, "signal", `🟠 <b>Sinjal i dobët</b>: ${who} — ${rx} dBm (OLT ${olt})`);
    } else if (rx !== null) {
      await clear(o.id, "signal");
    }

    // Danger signal (≈ -30 dBm) — a once-a-day flash while it persists, so the office is
    // reminded every day to send a technician before the customer drops entirely.
    if (rx !== null && rx <= SIGNAL_DANGER_DBM) {
      await fireDaily(o.id, `⚠️🚨 <b>Sinjal në rrezik</b> (≤ ${SIGNAL_DANGER_DBM} dBm): ${who} — ${rx} dBm (OLT ${olt}) — kontrollo sot!`);
    }

    // Expiry within 7 days
    if (o.expiration) {
      const days = Math.floor((o.expiration.getTime() - now) / 86_400_000);
      if (days <= EXPIRY_ALARM_DAYS) {
        const when = days < 0 ? `skadoi ${-days} ditë më parë` : `skadon pas ${days} ditë`;
        await fire(o.id, "expiry", `🟡 <b>Skadencë</b>: ${who} — ${when} (OLT ${olt})`);
      } else {
        await clear(o.id, "expiry");
      }
    }
  }
  return sent;
}
