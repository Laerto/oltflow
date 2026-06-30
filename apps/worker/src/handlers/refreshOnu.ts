import { getOnuDetail } from "@oltflow/adapters";
import type { RefreshOnuPayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { upsertOnu, recordSignal } from "../persist.js";
import { withOltLock } from "../olt-lock.js";

export async function handleRefreshOnu(payload: RefreshOnuPayload) {
  const olt = await loadOlt(payload.oltId);
  const detail = await withOltLock(olt.id, () => getOnuDetail(toCreds(olt), payload.ponPort));

  const onu = await upsertOnu(olt.id, payload.ponPort, {
    serial: detail.serial,
    name: detail.name,
    type: detail.type,
    state: detail.state,
    distance: detail.distance,
    onlineDuration: detail.onlineDuration,
    vlan: detail.vlan,
    pppoeUser: detail.pppoeUser,
    lineProfile: detail.lineProfile,
    serviceProfile: detail.serviceProfile,
  });

  await recordSignal(onu.id, detail);

  return { ...detail, onuId: onu.id };
}
