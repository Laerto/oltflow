import { authorizeAndPppoe } from "@oltflow/adapters";
import { parsePonPort, type AuthorizePppoePayload, sanitizeOutput } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";
import { resolveAcsUrl } from "../genieacs-url.js";
import { scheduleAcsRegistrationCheck } from "../schedule-acs-check.js";

export async function handleAuthorizePppoe(payload: AuthorizePppoePayload) {
  const olt = await loadOlt(payload.oltId);
  const pon = parsePonPort(payload.ponPort);
  const acsUrl = await resolveAcsUrl();
  const { output, onuInterface } = await withOltLock(olt.id, () =>
    authorizeAndPppoe(toCreds(olt), {
      pon,
      onuSerial: payload.onuSerial,
      onuName: payload.onuName,
      onuType: payload.onuType,
      tcontProfile: payload.tcontProfile,
      trafficProfile: payload.trafficProfile,
      vlanId: payload.vlanId,
      acsUrl,
      pppoeUsername: payload.pppoeUsername,
      pppoePassword: payload.pppoePassword,
    })
  );

  const onu = await prisma.onu
    .findFirst({
      where: {
        oltId: payload.oltId,
        OR: [
          { serial: { equals: payload.onuSerial, mode: "insensitive" } },
          { ponPort: payload.ponPort },
        ],
      },
      select: { id: true },
    })
    .catch(() => null);

  await scheduleAcsRegistrationCheck({
    serial: payload.onuSerial,
    oltId: payload.oltId,
    onuId: onu?.id,
  }).catch(() => {});

  return {
    message: `ONU ${payload.onuSerial} u autorizua dhe PPPoE u konfigurua`,
    onuInterface,
    pppoeUser: payload.pppoeUsername,
    output: sanitizeOutput(output),
  };
}
