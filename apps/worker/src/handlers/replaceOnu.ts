import { replaceOnu } from "@oltflow/adapters";
import { parsePonPort, sanitizeOutput, type ReplaceOnuPayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { upsertOnu } from "../persist.js";
import { withOltLock } from "../olt-lock.js";

export async function handleReplaceOnu(payload: ReplaceOnuPayload) {
  const olt = await loadOlt(payload.oltId);
  const pon = parsePonPort(payload.ponPort);
  const { output, onuInterface } = await withOltLock(olt.id, () =>
    replaceOnu(toCreds(olt), { pon, onuSerial: payload.onuSerial, onuType: payload.onuType })
  );

  await upsertOnu(olt.id, payload.ponPort, { serial: payload.onuSerial, type: payload.onuType });

  return {
    message: `ONU në ${payload.ponPort} u zëvendësua me SN ${payload.onuSerial}`,
    onuInterface,
    output: sanitizeOutput(output),
  };
}
