import { pushAcsUrl } from "@oltflow/adapters";
import { isEponPort, sanitizeOutput, type PushAcsPayload } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handlePushAcs(payload: PushAcsPayload) {
  const olt = await loadOlt(payload.oltId);
  // Targeted (specific ONUs from the ONU page) or bulk (every ONU on the OLT).
  const candidatePorts =
    payload.ponPorts && payload.ponPorts.length
      ? payload.ponPorts
      : (await prisma.onu.findMany({ where: { oltId: olt.id }, select: { ponPort: true } })).map((o) => o.ponPort);
  // GPON only — EPON ONUs use a different CLI tree and have no TR-069 ACS setting.
  const ponPorts = candidatePorts.filter((p) => !isEponPort(p));

  const { updated, failed, output } = await withOltLock(olt.id, () =>
    pushAcsUrl(toCreds(olt), ponPorts, payload.acsUrl)
  );

  return {
    message: `ACS URL u injektua në ${updated} ONU${failed.length ? `, dështuan ${failed.length}` : ""}`,
    updated,
    failed,
    output: sanitizeOutput(output),
  };
}
