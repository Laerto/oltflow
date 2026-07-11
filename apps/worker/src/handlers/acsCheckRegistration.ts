import { prisma } from "@oltflow/db";
import { listGenieDevices } from "@oltflow/adapters";
import type { AcsCheckRegistrationPayload } from "@oltflow/core";
import { resolveGenieacsUrl } from "../genieacs-url.js";
import { notifyEvent } from "../notify/engine.js";

/**
 * After provision: check whether the serial appeared in GenieACS.
 * If not, open an alarm key and fire acs.not_registered notification.
 */
export async function handleAcsCheckRegistration(payload: AcsCheckRegistrationPayload) {
  const serial = payload.serial.toUpperCase();
  const url = await resolveGenieacsUrl();
  if (!url) {
    return { skipped: true, reason: "GenieACS not configured" };
  }

  const devices = await listGenieDevices(url, { serial, limit: 5 }).catch(() => []);
  const found = devices.some((d) => d.serial?.toUpperCase() === serial || d.deviceId.toUpperCase().includes(serial));

  if (found) {
    // Mirror will pick it up on next tick; clear any expectedBy row
    await prisma.acsDevice.updateMany({
      where: { serial: { equals: serial, mode: "insensitive" } },
      data: { expectedBy: null },
    });
    return { registered: true, serial };
  }

  const alarmKey = `acs.not_registered:${serial}`;
  await prisma.alarm.upsert({
    where: { key: alarmKey },
    create: {
      key: alarmKey,
      type: "acs.not_registered",
      severity: "warning",
      oltId: payload.oltId ?? null,
      onuId: payload.onuId ?? null,
      title: `ACS: ${serial} nuk u regjistrua`,
      detail: "ONU u autorizua por s'ka informuar GenieACS — kontrollo tr069-mgmt / ACS URL",
      href: payload.onuId ? `/onus/${payload.onuId}` : "/unconfigured",
    },
    update: {
      clearedAt: null,
      lastSeenAt: new Date(),
      title: `ACS: ${serial} nuk u regjistrua`,
    },
  });

  await notifyEvent({
    eventType: "acs.not_registered",
    severity: "warning",
    title: `ACS registration missing: ${serial}`,
    body: `ONU ${serial} u autorizua por nuk është në GenieACS. Kontrollo tr069-mgmt / rrjetin e ACS.`,
    alarmKey,
    oltId: payload.oltId,
    onuId: payload.onuId,
  });

  return { registered: false, serial };
}
