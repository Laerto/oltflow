import { prisma } from "@oltflow/db";
import { getPonTrafficCounters } from "@oltflow/adapters";
import { toSnmpCreds } from "../olt-creds.js";

const COUNTER_MAX = 2n ** 32n; // 32-bit ifInOctets/ifOutOctets wrap point
const RETAIN_MS = 24 * 60 * 60 * 1000; // keep a day of samples for the graph
const MAX_BPS = 100e9; // sanity cap — a PON port never exceeds this; above ⇒ counter reset
const BACKOFF_MS = 10 * 60 * 1000; // OLTs without SNMP time out; back them off after a failure

// Last raw counters per `oltId:ifIndex`, kept in memory to derive a rate from the delta.
// On worker restart the first poll just re-seeds this (no row written), which is fine.
type Sample = { inOct: bigint; outOct: bigint; ts: number };
const lastByPort = new Map<string, Sample>();

// When an OLT's SNMP fails (not enabled / ACL / timeout) we skip it until this time, so a
// few dead OLTs don't cost ~5s of timeout each on every 30s tick.
const nextAttempt = new Map<number, number>();

/** Delta across a 32-bit counter, accounting for a single wrap. */
function unwrapDelta(curr: bigint, prev: bigint): bigint {
  return curr >= prev ? curr - prev : COUNTER_MAX - prev + curr;
}

/** Polls SNMP octet counters on every OLT, converts the delta since the last poll into
 * per-PON-port bps, and stores a sample row. Returns how many rows were written. */
export async function syncPonTraffic(): Promise<number> {
  const olts = await prisma.olt.findMany({
    select: { id: true, ip: true, snmpPort: true, snmpCommunity: true, snmpVersion: true },
  });

  let written = 0;
  for (const olt of olts) {
    if (Date.now() < (nextAttempt.get(olt.id) ?? 0)) continue;

    let counters;
    try {
      counters = await getPonTrafficCounters(toSnmpCreds(olt));
      nextAttempt.delete(olt.id);
    } catch {
      nextAttempt.set(olt.id, Date.now() + BACKOFF_MS);
      continue;
    }

    const ts = Date.now();
    const rows: { oltId: number; ponPort: string; downBps: number; upBps: number }[] = [];
    for (const c of counters) {
      const key = `${olt.id}:${c.ifIndex}`;
      const prev = lastByPort.get(key);
      lastByPort.set(key, { inOct: c.inOctets, outOct: c.outOctets, ts });
      if (!prev) continue; // first sample only seeds the baseline

      const dt = (ts - prev.ts) / 1000;
      if (dt <= 0) continue;
      const upBps = (Number(unwrapDelta(c.inOctets, prev.inOct)) * 8) / dt;
      const downBps = (Number(unwrapDelta(c.outOctets, prev.outOct)) * 8) / dt;
      if (upBps > MAX_BPS || downBps > MAX_BPS) continue; // counter reset ⇒ drop this delta
      rows.push({ oltId: olt.id, ponPort: c.ponPort, downBps, upBps });
    }

    if (rows.length) {
      await prisma.ponTraffic.createMany({ data: rows });
      written += rows.length;
    }
    await prisma.ponTraffic.deleteMany({
      where: { oltId: olt.id, recordedAt: { lt: new Date(Date.now() - RETAIN_MS) } },
    });
  }
  return written;
}
