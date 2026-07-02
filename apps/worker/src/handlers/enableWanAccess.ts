import { enableWanAccess } from "@oltflow/adapters";
import { parsePonPort, sanitizeOutput, type EnableWanAccessPayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handleEnableWanAccess(payload: EnableWanAccessPayload) {
  const olt = await loadOlt(payload.oltId);
  const pon = parsePonPort(payload.ponPort);
  const { output, onuInterface } = await withOltLock(olt.id, () =>
    enableWanAccess(toCreds(olt), { pon })
  );
  return {
    message: `Aksesi WAN u aktivizua për ${payload.ponPort}`,
    onuInterface,
    output: sanitizeOutput(output),
  };
}
