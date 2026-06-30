import { scanUnconfigured } from "@oltflow/adapters";
import type { ScanUnconfiguredPayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handleScanUnconfigured(payload: ScanUnconfiguredPayload) {
  const olt = await loadOlt(payload.oltId);
  const onus = await withOltLock(olt.id, () => scanUnconfigured(toCreds(olt)));
  return { onus, total: onus.length };
}
