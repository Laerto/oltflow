import { prisma } from "@oltflow/db";
import { getOltHealth } from "@oltflow/adapters";
import { toSnmpCreds } from "../olt-creds.js";

const RETAIN_MS = 24 * 60 * 60 * 1000; // keep a day of snapshots for the trend
const BACKOFF_MS = 10 * 60 * 1000; // OLTs without SNMP time out; back them off after a failure

// When an OLT's SNMP fails (not enabled / ACL / timeout) we skip it until this time, so a
// few dead OLTs don't cost a timeout each on every tick. Mirrors sync/pon-traffic.ts.
const nextAttempt = new Map<number, number>();

/** Polls per-card CPU% + temperature over SNMP on every OLT and stores one snapshot row per
 * card. Returns how many rows were written. */
export async function syncOltHealth(): Promise<number> {
  const olts = await prisma.olt.findMany({
    select: { id: true, ip: true, snmpPort: true, snmpCommunity: true, snmpVersion: true },
  });

  let written = 0;
  for (const olt of olts) {
    if (Date.now() < (nextAttempt.get(olt.id) ?? 0)) continue;

    let cards;
    try {
      cards = await getOltHealth(toSnmpCreds(olt));
      nextAttempt.delete(olt.id);
    } catch {
      nextAttempt.set(olt.id, Date.now() + BACKOFF_MS);
      continue;
    }

    if (cards.length) {
      await prisma.oltHealth.createMany({
        data: cards.map((c) => ({ oltId: olt.id, slot: c.slot, card: c.card, cpu: c.cpu, temp: c.temp })),
      });
      written += cards.length;
    }
    await prisma.oltHealth.deleteMany({
      where: { oltId: olt.id, recordedAt: { lt: new Date(Date.now() - RETAIN_MS) } },
    });
  }
  return written;
}
