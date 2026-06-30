import { discoverOlt } from "@oltflow/adapters";
import type { SnmpDiscoverPayload } from "@oltflow/core";
import { loadOlt, toSnmpCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

/** Diagnostic job: dumps raw SNMP OID/value pairs from one OLT so the real
 * ZTE state/signal OID mapping can be confirmed before any sync job relies
 * on SNMP for parsed data. Result lands in Job.output via the generic
 * handler wrapper in index.ts — inspect it with GET /api/jobs/:id. */
export async function handleSnmpDiscover(payload: SnmpDiscoverPayload) {
  const olt = await loadOlt(payload.oltId);
  return withOltLock(olt.id, () => discoverOlt(toSnmpCreds(olt)));
}
