import { authorizeEponOnu } from "@oltflow/adapters";
import { parseEponPort, type AuthorizeEponPayload, sanitizeOutput } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handleAuthorizeEponOnu(payload: AuthorizeEponPayload) {
  const olt = await loadOlt(payload.oltId);
  // Only frame/slot/port matter — the adapter picks a free onu-id from the OLT itself
  // (the `:N` on an unauthenticated ONU is a placeholder, not the real id).
  const { frame, slot, port } = parseEponPort(payload.ponPort);
  const { output, onuInterface, onuId } = await withOltLock(olt.id, () =>
    authorizeEponOnu(toCreds(olt), {
      pon: { frame, slot, port },
      onuMac: payload.onuMac,
      onuType: payload.onuType,
      onuName: payload.onuName,
      vlanId: payload.vlanId,
    })
  );

  return {
    message: `ONU EPON ${payload.onuMac} u autorizua si ${onuInterface} (id ${onuId})`,
    onuInterface,
    onuId,
    output: sanitizeOutput(output),
  };
}
