import { prisma, getNumberSetting, SETTING_KEYS } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { enqueue } from "./queue.js";

/** After provisioning, schedule a delayed ACS registration check. */
export async function scheduleAcsRegistrationCheck(opts: {
  serial: string;
  oltId: number;
  onuId?: number;
}): Promise<void> {
  const serial = opts.serial.toUpperCase();
  let minutes = 15;
  try {
    minutes = await getNumberSetting(SETTING_KEYS.acsProvisionCheckMin);
  } catch {
    minutes = Number(process.env.ACS_PROVISION_CHECK_MIN ?? 15);
  }
  const delayMs = Math.max(1, minutes) * 60_000;

  // Placeholder so UI can show "waiting for ACS"
  await prisma.acsDevice
    .upsert({
      where: { deviceId: `pending:${serial}` },
      create: {
        deviceId: `pending:${serial}`,
        serial,
        onuId: opts.onuId ?? null,
        registered: false,
        expectedBy: new Date(Date.now() + delayMs),
        mirroredAt: new Date(),
      },
      update: {
        expectedBy: new Date(Date.now() + delayMs),
        registered: false,
        onuId: opts.onuId ?? undefined,
      },
    })
    .catch(() => {});

  await enqueue(
    JOB_NAMES.acsCheckRegistration,
    { serial, oltId: opts.oltId, onuId: opts.onuId },
    undefined,
    delayMs
  );
}
