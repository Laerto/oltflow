import { prisma } from "@oltflow/db";
import { listGenieDevices, refreshDeviceObject } from "@oltflow/adapters";
import type { AcsRefreshPayload } from "@oltflow/core";
import { resolveGenieacsUrl } from "../genieacs-url.js";

/** Targeted live refresh: ask ACS to refreshObject, re-fetch device, upsert mirror. */
export async function handleAcsRefresh(payload: AcsRefreshPayload) {
  const url = await resolveGenieacsUrl();
  if (!url) throw new Error("GenieACS nuk është konfiguruar");

  const serial = payload.serial.toUpperCase();
  let devices = await listGenieDevices(url, { serial, limit: 5 });
  let device = devices.find((d) => d.serial?.toUpperCase() === serial) ?? devices[0];

  if (device?.deviceId) {
    await refreshDeviceObject(url, device.deviceId).catch(() => {});
    // Brief pause for connection-request / inform
    await new Promise((r) => setTimeout(r, 2500));
    devices = await listGenieDevices(url, { serial, limit: 5 });
    device = devices.find((d) => d.serial?.toUpperCase() === serial) ?? devices[0] ?? device;
  }

  if (!device) {
    return { found: false, message: `Asnjë CPE në ACS për serial ${serial}` };
  }

  await prisma.acsDevice.upsert({
    where: { deviceId: device.deviceId },
    create: {
      deviceId: device.deviceId,
      serial: device.serial,
      onuId: payload.onuId,
      productClass: device.productClass,
      modelName: device.modelName,
      hardwareVersion: device.hardwareVersion,
      softwareVersion: device.softwareVersion,
      wanIp: device.wanIp,
      wanMode: device.wanMode,
      uptimeSec: device.uptimeSec,
      ssid2g: device.ssid2g,
      ssid5g: device.ssid5g,
      wifiEnabled2g: device.wifiEnabled2g,
      wifiEnabled5g: device.wifiEnabled5g,
      lanHosts: device.lanHosts as object[],
      lastInform: device.lastInform,
      lastBootstrap: device.lastBootstrap,
      mirroredAt: new Date(),
      expectedBy: null,
    },
    update: {
      serial: device.serial,
      onuId: payload.onuId,
      productClass: device.productClass,
      modelName: device.modelName,
      hardwareVersion: device.hardwareVersion,
      softwareVersion: device.softwareVersion,
      wanIp: device.wanIp,
      wanMode: device.wanMode,
      uptimeSec: device.uptimeSec,
      ssid2g: device.ssid2g,
      ssid5g: device.ssid5g,
      wifiEnabled2g: device.wifiEnabled2g,
      wifiEnabled5g: device.wifiEnabled5g,
      lanHosts: device.lanHosts as object[],
      lastInform: device.lastInform,
      lastBootstrap: device.lastBootstrap,
      mirroredAt: new Date(),
      expectedBy: null,
    },
  });

  return {
    found: true,
    message: `ACS u rifreskua për ${serial}`,
    deviceId: device.deviceId,
    wanIp: device.wanIp,
    softwareVersion: device.softwareVersion,
    lanHosts: device.lanHosts.length,
  };
}
