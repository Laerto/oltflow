import { authorizeAndPppoe } from "@oltflow/adapters";
import { parsePonPort, type AuthorizePppoePayload, sanitizeOutput } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

const ACS_URL = process.env.ACS_URL ?? "";

export async function handleAuthorizePppoe(payload: AuthorizePppoePayload) {
  const olt = await loadOlt(payload.oltId);
  const pon = parsePonPort(payload.ponPort);
  const { output, onuInterface } = await withOltLock(olt.id, () =>
    authorizeAndPppoe(toCreds(olt), {
      pon,
      onuSerial: payload.onuSerial,
      onuName: payload.onuName,
      onuType: payload.onuType,
      tcontProfile: payload.tcontProfile,
      trafficProfile: payload.trafficProfile,
      vlanId: payload.vlanId,
      acsUrl: ACS_URL,
      pppoeUsername: payload.pppoeUsername,
      pppoePassword: payload.pppoePassword,
    })
  );
  return {
    message: `ONU ${payload.onuSerial} u autorizua dhe PPPoE u konfigurua`,
    onuInterface,
    pppoeUser: payload.pppoeUsername,
    output: sanitizeOutput(output),
  };
}
