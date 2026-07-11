import { factoryResetDevice } from "@oltflow/adapters";
import type { AcsFactoryResetPayload } from "@oltflow/core";
import { resolveGenieacsUrl } from "../genieacs-url.js";

export async function handleAcsFactoryReset(payload: AcsFactoryResetPayload) {
  const url = await resolveGenieacsUrl();
  if (!url) throw new Error("GenieACS nuk është konfiguruar");
  if (!payload.deviceId) throw new Error("deviceId mungon");
  const r = await factoryResetDevice(url, payload.deviceId);
  return { message: "Factory reset u dërgua te CPE (TR-069)", status: r.status };
}
