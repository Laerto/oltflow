import { snmpWalk, type SnmpCreds } from "./snmp-session.js";

// This ZTE C300/C320 firmware leaves the 64-bit HC octet counters (ifHCInOctets/.6,
// ifHCOutOctets/.10) empty, but populates the classic 32-bit IF-MIB counters per PON
// port — so we read those and handle the 32-bit wrap when computing a rate.
const OID_IF_NAME = "1.3.6.1.2.1.31.1.1.1.1"; // ifName
const OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10"; // ifInOctets  (upstream: from subscribers)
const OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16"; // ifOutOctets (downstream: to subscribers)

// Matches gpon_1/15/6, epon_1/3/1, etc. (the PON access ports) but not xgei/gei uplinks.
const PON_NAME_RE = /pon_\d/i;

export interface PonPortCounters {
  ponPort: string; // ifName, e.g. gpon_1/15/6
  ifIndex: string;
  inOctets: bigint; // upstream octets (from subscribers)
  outOctets: bigint; // downstream octets (to subscribers)
}

const lastOidSegment = (oid: string): string => oid.slice(oid.lastIndexOf(".") + 1);
const isUint = (s: string | undefined): s is string => /^\d+$/.test(s ?? "");

/** Raw per-PON-port octet counters from one SNMP poll. Rate is computed by the caller
 * from the delta between two polls. Non-PON interfaces and ports with unreadable
 * counters are skipped. */
export async function getPonTrafficCounters(creds: SnmpCreds): Promise<PonPortCounters[]> {
  const [names, ins, outs] = await Promise.all([
    snmpWalk(creds, OID_IF_NAME),
    snmpWalk(creds, OID_IF_IN_OCTETS),
    snmpWalk(creds, OID_IF_OUT_OCTETS),
  ]);

  const nameByIdx = new Map<string, string>();
  for (const v of names) nameByIdx.set(lastOidSegment(v.oid), v.value);
  const inByIdx = new Map<string, string>();
  for (const v of ins) inByIdx.set(lastOidSegment(v.oid), v.value);

  const out: PonPortCounters[] = [];
  for (const v of outs) {
    const idx = lastOidSegment(v.oid);
    const name = nameByIdx.get(idx);
    if (!name || !PON_NAME_RE.test(name)) continue;
    const inRaw = inByIdx.get(idx);
    if (!isUint(inRaw) || !isUint(v.value)) continue;
    out.push({ ponPort: name, ifIndex: idx, inOctets: BigInt(inRaw), outOctets: BigInt(v.value) });
  }
  return out;
}
