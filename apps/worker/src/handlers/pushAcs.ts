import { pushAcsUrl } from "@oltflow/adapters";
import { isEponPort, sanitizeOutput, type PushAcsPayload } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handlePushAcs(payload: PushAcsPayload) {
  const olt = await loadOlt(payload.oltId);
  const onus = await prisma.onu.findMany({ where: { oltId: olt.id }, select: { ponPort: true } });
  // GPON only — EPON ONUs use a different CLI tree and have no TR-069 ACS setting.
  const ponPorts = onus.map((o) => o.ponPort).filter((p) => !isEponPort(p));

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
