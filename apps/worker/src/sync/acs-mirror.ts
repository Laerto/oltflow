import { prisma, getNumberSetting, SETTING_KEYS } from "@oltflow/db";
import { listGenieDevices } from "@oltflow/adapters";
import { resolveGenieacsUrl } from "../genieacs-url.js";
import { log } from "../logger.js";

const PAGE = 100;

/**
 * Pulls GenieACS devices in pages and upserts into AcsDevice.
 * Links to Onu by serial (case-insensitive) when a match exists.
 */
export async function syncAcsMirror(): Promise<{ upserted: number; linked: number }> {
  const url = await resolveGenieacsUrl();
  if (!url) {
    log.debug("acs-mirror skipped: no GenieACS URL");
    return { upserted: 0, linked: 0 };
  }

  let skip = 0;
  let upserted = 0;
  let linked = 0;
  const seenDeviceIds = new Set<string>();

  for (;;) {
    let page;
    try {
      page = await listGenieDevices(url, { skip, limit: PAGE });
    } catch (err) {
      log.warn({ err: String(err) }, "acs-mirror page fetch failed");
      break;
    }
    if (page.length === 0) break;

    for (const d of page) {
      seenDeviceIds.add(d.deviceId);
      let onuId: number | null = null;
      if (d.serial) {
        const onu = await prisma.onu.findFirst({
          where: { serial: { equals: d.serial, mode: "insensitive" } },
          select: { id: true },
        });
        if (onu) {
          // Prefer first match; if another AcsDevice already owns this onuId, leave unlinked
          const taken = await prisma.acsDevice.findFirst({
            where: { onuId: onu.id, NOT: { deviceId: d.deviceId } },
            select: { id: true },
          });
          if (!taken) {
            onuId = onu.id;
            linked++;
          }
        }
      }

      const data = {
        serial: d.serial,
        productClass: d.productClass,
        modelName: d.modelName,
        hardwareVersion: d.hardwareVersion,
        softwareVersion: d.softwareVersion,
        wanIp: d.wanIp,
        wanMode: d.wanMode,
        uptimeSec: d.uptimeSec,
        ssid2g: d.ssid2g,
        ssid5g: d.ssid5g,
        wifiEnabled2g: d.wifiEnabled2g,
        wifiEnabled5g: d.wifiEnabled5g,
        lanHosts: d.lanHosts as object[],
        lastInform: d.lastInform,
        lastBootstrap: d.lastBootstrap,
        registered: true,
        mirroredAt: new Date(),
        expectedBy: null as Date | null,
      };
      try {
        await prisma.acsDevice.upsert({
          where: { deviceId: d.deviceId },
          create: { deviceId: d.deviceId, onuId, ...data },
          update: { onuId, ...data },
        });
      } catch {
        // onuId unique conflict — store without link
        await prisma.acsDevice.upsert({
          where: { deviceId: d.deviceId },
          create: { deviceId: d.deviceId, onuId: null, ...data },
          update: { ...data, onuId: undefined },
        });
      }
      // Drop pending: placeholder if real device arrived
      if (d.serial) {
        await prisma.acsDevice
          .deleteMany({ where: { deviceId: `pending:${d.serial.toUpperCase()}` } })
          .catch(() => {});
      }
      upserted++;
    }

    if (page.length < PAGE) break;
    skip += PAGE;
  }

  log.info({ upserted, linked }, "acs-mirror done");
  return { upserted, linked };
}

export async function acsMirrorIntervalMs(): Promise<number> {
  try {
    return await getNumberSetting(SETTING_KEYS.acsMirrorIntervalMs);
  } catch {
    return Number(process.env.ACS_MIRROR_INTERVAL_MS ?? 900_000);
  }
}
