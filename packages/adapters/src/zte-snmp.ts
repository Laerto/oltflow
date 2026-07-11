import { snmpGet, snmpWalk, type SnmpCreds, type VarBind } from "./snmp-session.js";

const SYS_DESCR_OID = "1.3.6.1.2.1.1.1";
/** ZTE's IANA-assigned enterprise number — the private MIB subtree for
 * GPON OLT/ONU state and optical-signal objects lives somewhere under here,
 * but the exact OID path is firmware/release-dependent and NOT hardcoded
 * yet. Run discoverOlt() against a real C300/C320 first and use the output
 * to fill in the real state/signal OIDs before relying on SNMP for parsed
 * data — see plan notes in zte-snmp.ts's module comment. */
const ZTE_ENTERPRISE_OID = "1.3.6.1.4.1.3902";

export interface SnmpDiscoveryResult {
  sysDescr: VarBind[];
  zteSubtree: VarBind[];
}

/**
 * Diagnostic-only: dumps sysDescr + the ZTE enterprise OID subtree from one
 * live OLT so the real state/signal OID mapping can be confirmed and wired
 * into proper parsers here. Not used by any sync job yet — run it manually
 * (via the snmp-discover job) against one real device first.
 */
export async function discoverOlt(creds: SnmpCreds): Promise<SnmpDiscoveryResult> {
  const sysDescr = await snmpGet(creds, [SYS_DESCR_OID]);
  const zteSubtree = await snmpWalk(creds, ZTE_ENTERPRISE_OID);
  return { sysDescr, zteSubtree };
}

// Per-card real-time status table on ZTE C300/C320 (confirmed live against V1.2.5P3 on both
// models). Columns share the base `...2.1.1.3.1.<col>` and are indexed by `.<rack>.<shelf>.<slot>`
// (e.g. `.1.1.4` = the control card in slot 4). Discovered via the snmp-discover dump, then
// cross-checked: col 9 fluctuates and differs per card ⇒ CPU%, col 11 is stable per card ⇒ °C.
const OID_CARD_NAME = "1.3.6.1.4.1.3902.1015.2.1.1.3.1.4"; // card model, e.g. "GTGHG"
const OID_CARD_CPU = "1.3.6.1.4.1.3902.1015.2.1.1.3.1.9"; // CPU utilisation, percent
const OID_CARD_TEMP = "1.3.6.1.4.1.3902.1015.2.1.1.3.1.11"; // board temperature, °C

export interface OltCardHealth {
  slot: number; // trailing OID index, matches the card's physical slot
  card: string; // card model name (empty ⇒ slot skipped)
  cpu: number; // percent 0-100
  temp: number; // Celsius
}

/** Index portion of a table cell OID: everything after `<base>.` (e.g. "1.1.4"). */
const cellIndex = (oid: string, base: string): string =>
  oid.startsWith(`${base}.`) ? oid.slice(base.length + 1) : oid.replace(/^\./, "");

const lastSegment = (index: string): number => Number(index.slice(index.lastIndexOf(".") + 1));

// Plausibility guards: a garbled SNMP read must never poison the panel. CPU is a percentage;
// board temperature on these cards sits ~5-70 °C, so anything outside a wide sane band is a
// bad decode and is dropped to 0 rather than shown.
const TEMP_MIN = -20;
const TEMP_MAX = 150;
const clampCpu = (n: unknown): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n as number)) : 0);
const cleanTemp = (n: unknown): number =>
  Number.isFinite(n) && (n as number) >= TEMP_MIN && (n as number) <= TEMP_MAX ? Math.round(n as number) : 0;

/**
 * Reads CPU% and temperature for every populated card (control + line cards) from one OLT.
 * Cards with a blank model name are skipped; a card that doesn't report CPU/temp (e.g. the
 * power card) comes back with 0. Values are clamped/validated so a bad decode can't spike the
 * dashboard. Rate-free — each poll is a full snapshot.
 */
export async function getOltHealth(creds: SnmpCreds): Promise<OltCardHealth[]> {
  const [names, cpus, temps] = await Promise.all([
    snmpWalk(creds, OID_CARD_NAME),
    snmpWalk(creds, OID_CARD_CPU),
    snmpWalk(creds, OID_CARD_TEMP),
  ]);

  const cpuByIdx = new Map<string, number>();
  for (const v of cpus) cpuByIdx.set(cellIndex(v.oid, OID_CARD_CPU), Number(v.value));
  const tempByIdx = new Map<string, number>();
  for (const v of temps) tempByIdx.set(cellIndex(v.oid, OID_CARD_TEMP), Number(v.value));

  const out: OltCardHealth[] = [];
  for (const v of names) {
    const card = v.value.trim();
    if (!card) continue; // empty slot
    const idx = cellIndex(v.oid, OID_CARD_NAME);
    out.push({
      slot: lastSegment(idx),
      card,
      cpu: clampCpu(cpuByIdx.get(idx)),
      temp: cleanTemp(tempByIdx.get(idx)),
    });
  }
  return out.sort((a, b) => a.slot - b.slot);
}
