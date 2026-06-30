import { setPppoe } from "@oltflow/adapters";
import { parsePonPort, type PppoePayload, sanitizeOutput } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handlePppoe(payload: PppoePayload) {
  const olt = await loadOlt(payload.oltId);
  const pon = parsePonPort(payload.ponPort);
  const { output, onuInterface } = await withOltLock(olt.id, () =>
    setPppoe(toCreds(olt), {
      pon,
      pppoeUsername: payload.pppoeUsername,
      pppoePassword: payload.pppoePassword,
    })
  );
  return {
    message: `PPPoE u konfigurua për ${onuInterface}`,
    pppoeUser: payload.pppoeUsername,
    output: sanitizeOutput(output),
  };
}
