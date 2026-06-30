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
