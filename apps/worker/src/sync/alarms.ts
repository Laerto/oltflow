import { prisma } from "@oltflow/db";
import { sendTelegram, telegramConfigured } from "../telegram.js";

// Fires a Telegram alert once per (ONU, alarm-type) and won't repeat until the
// condition clears — so a persistently-offline ONU doesn't spam every tick.
// Alarm types per spec: offline, weak signal (< -27 dBm), expiry within 7 days.
type AlarmType = "offline" | "signal" | "expiry";
const active = new Set<string>(); // `${onuId}:${type}` currently alerted
const SIGNAL_ALARM_DBM = -27;
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
    if (active.has(key)) return; // already alerted, still active
    active.add(key);
    if (await sendTelegram(text)) sent++;
  };
  const clear = (id: number, type: AlarmType) => active.delete(`${id}:${type}`);

  for (const o of onus) {
    const who = `${o.name || o.serial || o.ponPort} (${o.serial ?? "-"})${o.mgmtIp ? ` · ${o.mgmtIp}` : ""}`;
    const olt = o.olt.name;

    // Offline
    if (o.state && o.state !== "working") {
      await fire(o.id, "offline", `🔴 <b>ONU Offline</b>: ${who} — OLT ${olt}`);
    } else if (o.state === "working") {
      clear(o.id, "offline");
    }

    // Weak signal
    const rx = o.signals[0]?.onuRx ?? null;
    if (rx !== null && rx < SIGNAL_ALARM_DBM) {
      await fire(o.id, "signal", `🟠 <b>Sinjal i dobët</b>: ${who} — ${rx} dBm (OLT ${olt})`);
    } else if (rx !== null) {
      clear(o.id, "signal");
    }

    // Expiry within 7 days
    if (o.expiration) {
      const days = Math.floor((o.expiration.getTime() - now) / 86_400_000);
      if (days <= EXPIRY_ALARM_DAYS) {
        const when = days < 0 ? `skadoi ${-days} ditë më parë` : `skadon pas ${days} ditë`;
        await fire(o.id, "expiry", `🟡 <b>Skadencë</b>: ${who} — ${when} (OLT ${olt})`);
      } else {
        clear(o.id, "expiry");
      }
    }
  }
  return sent;
}
