import { rebootDevice } from "@oltflow/adapters";
import type { RebootOnuPayload } from "@oltflow/core";
import { resolveGenieacsUrl } from "../genieacs-url.js";

/** GenieACS-only — no OLT CLI session, so no per-OLT lock needed here. */
export async function handleRebootOnu(payload: RebootOnuPayload) {
  const GENIEACS_URL = await resolveGenieacsUrl();
  if (!GENIEACS_URL) throw new Error("GenieACS nuk është konfiguruar");
  await rebootDevice(GENIEACS_URL, payload.deviceId);
  return { message: "Komanda e riniseje u dërgua via TR-069" };
}
