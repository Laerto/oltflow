import { updateWifi } from "@oltflow/adapters";
import type { WifiPayload } from "@oltflow/core";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

export async function handleWifi(payload: WifiPayload) {
  const results = await updateWifi(GENIEACS_URL, {
    deviceId: payload.deviceId,
    ssid2g: payload.ssid2g,
    pass2g: payload.pass2g,
    ssid5g: payload.ssid5g,
    pass5g: payload.pass5g,
  });
  const ok = results.filter((r) => !r.error).length;
  return {
    message: `WiFi u dërgua te ONU via TR-069 (${ok}/${results.length} task)`,
    results,
  };
}
