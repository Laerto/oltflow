import { scanUnconfigured } from "@oltflow/adapters";
import type { ScanUnconfiguredPayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";
import { reconcileUnconfigured } from "../persist.js";

export async function handleScanUnconfigured(payload: ScanUnconfiguredPayload) {
  const olt = await loadOlt(payload.oltId);
  const onus = await withOltLock(olt.id, () => scanUnconfigured(toCreds(olt)));
  // Persist so the dashboard/Unconfigured page (which read the DB) reflect a manual scan too.
  await reconcileUnconfigured(olt.id, onus);
  return { onus, total: onus.length };
}
