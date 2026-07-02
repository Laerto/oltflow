import { rebootOnuCli } from "@oltflow/adapters";
import { sanitizeOutput, type RebootOnuCliPayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handleRebootOnuCli(payload: RebootOnuCliPayload) {
  const olt = await loadOlt(payload.oltId);
  const { output } = await withOltLock(olt.id, () => rebootOnuCli(toCreds(olt), payload.ponPort));
  return { message: `ONU ${payload.ponPort} po riniset`, output: sanitizeOutput(output) };
}
