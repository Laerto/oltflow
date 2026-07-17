import { authorizeOnu } from "@oltflow/adapters";
import { parsePonPort, type ProvisionPayload, sanitizeOutput } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";
import { resolveAcsUrl } from "../genieacs-url.js";
import { scheduleAcsRegistrationCheck } from "../schedule-acs-check.js";

export async function handleProvision(payload: ProvisionPayload) {
  const olt = await loadOlt(payload.oltId);
  const pon = parsePonPort(payload.ponPort);
  const acsUrl = await resolveAcsUrl();
  const { output, onuInterface } = await withOltLock(olt.id, () =>
    authorizeOnu(toCreds(olt), {
      pon,
      onuSerial: payload.onuSerial,
      onuName: payload.onuName,
      onuType: payload.onuType,
      tcontProfile: payload.tcontProfile,
      trafficProfile: payload.trafficProfile,
      vlanId: payload.vlanId,
      acsUrl,
    })
  );

  const onu = await prisma.onu
    .findFirst({
      where: {
        oltId: payload.oltId,
        OR: [
          { serial: { equals: payload.onuSerial, mode: "insensitive" } },
          // The real authorized interface (free index) — NOT payload.ponPort, whose uncfg
          // placeholder `:1` would match the existing customer at index 1.
          { ponPort: onuInterface },
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
    message: `ONU ${payload.onuSerial} u autorizua në ${onuInterface}`,
    onuInterface,
    output: sanitizeOutput(output),
  };
}
