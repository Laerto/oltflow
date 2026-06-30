import { rebootDevice } from "@oltflow/adapters";
import type { RebootOnuPayload } from "@oltflow/core";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

/** GenieACS-only — no OLT CLI session, so no per-OLT lock needed here. */
export async function handleRebootOnu(payload: RebootOnuPayload) {
  await rebootDevice(GENIEACS_URL, payload.deviceId);
  return { message: "Komanda e riniseje u dërgua via TR-069" };
}
