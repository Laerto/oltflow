// TR-069 WiFi read/update via GenieACS NBI, ported from main.py's /api/wifi-info, /api/wifi-update.

export interface WlanBand {
  ssid: string;
  password: string;
  enabled: boolean;
  wlanIdx: string;
  standard: string;
}

export interface WifiDevice {
  deviceId: string;
  wlan2g?: WlanBand;
  wlan5g?: WlanBand;
}

type GenieDevice = Record<string, unknown>;

function deepGet(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Pulls the PPPoE WAN external IP (TR-098 `WANPPPConnection.ExternalIPAddress`) for
 * many ONUs in a single GenieACS `/devices` fetch, keyed by serial — avoids re-fetching
 * the full device list once per ONU when rendering a list page. */
export async function getWanIpsBySerial(genieacsUrl: string, serials: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const wanted = serials.filter(Boolean).map((s) => s.toUpperCase());
  if (!wanted.length) return result;

  const res = await fetch(`${genieacsUrl}/devices`);
  if (!res.ok) throw new Error(`GenieACS /devices dështoi: ${res.status}`);
  const devices = (await res.json()) as GenieDevice[];

  for (const d of devices) {
    const id = String(d._id ?? "").toUpperCase();
    const matchedSerial = wanted.find((sn) => id.includes(sn));
    if (!matchedSerial || result.has(matchedSerial)) continue;
    const ip = extractWanIp(d);
    if (ip) result.set(matchedSerial, ip);
  }
  return result;
}

function extractWanIp(d: GenieDevice): string | undefined {
  const wanDevices = deepGet(d, "InternetGatewayDevice", "WANDevice") as Record<string, unknown> | undefined;
  if (!wanDevices) return undefined;
  for (const wan of Object.values(wanDevices)) {
    const connDevices = deepGet(wan, "WANConnectionDevice") as Record<string, unknown> | undefined;
    if (!connDevices) continue;
    for (const connDevice of Object.values(connDevices)) {
      const pppConns = deepGet(connDevice, "WANPPPConnection") as Record<string, unknown> | undefined;
      if (!pppConns) continue;
      for (const conn of Object.values(pppConns)) {
        const ip = deepGet(conn, "ExternalIPAddress", "_value") as string | undefined;
        if (ip && ip !== "0.0.0.0") return ip;
      }
    }
  }
  return undefined;
}

export async function getWifiInfo(genieacsUrl: string, serial: string): Promise<WifiDevice[]> {
  const res = await fetch(`${genieacsUrl}/devices`);
  if (!res.ok) throw new Error(`GenieACS /devices dështoi: ${res.status}`);
  const devices = (await res.json()) as GenieDevice[];
  const sn = serial.toUpperCase();
  const result: WifiDevice[] = [];

  for (const d of devices) {
    const id = String(d._id ?? "");
    if (!id.toUpperCase().includes(sn)) continue;

    const wifi: WifiDevice = { deviceId: id };
    const lanDevices = deepGet(d, "InternetGatewayDevice", "LANDevice") as
      | Record<string, unknown>
      | undefined;
    if (!lanDevices) {
      result.push(wifi);
      continue;
    }

    for (const lan of Object.values(lanDevices)) {
      if (typeof lan !== "object" || lan === null) continue;
      const wlanCfg = (lan as Record<string, unknown>).WLANConfiguration as
        | Record<string, unknown>
        | undefined;
      if (!wlanCfg) continue;

      for (const [wlanIdx, wv] of Object.entries(wlanCfg)) {
        if (typeof wv !== "object" || wv === null) continue;
        const ssid = (deepGet(wv, "SSID", "_value") as string) ?? "";
        if (!ssid || ssid.startsWith("SSID")) continue;
        const standard = (deepGet(wv, "Standard", "_value") as string) ?? "";
        const enabled = (deepGet(wv, "Enable", "_value") as boolean) ?? true;

        let password = "";
        const pskObj = deepGet(wv, "PreSharedKey") as Record<string, unknown> | undefined;
        if (pskObj) {
          for (const pv of Object.values(pskObj)) {
            const key = deepGet(pv, "KeyPassphrase", "_value") as string | undefined;
            if (key) {
              password = key;
              break;
            }
          }
        }

        const band: WlanBand = { ssid, password, enabled, wlanIdx, standard };
        const num = Number.parseInt(wlanIdx, 10);
        if (num === 1 && !wifi.wlan2g) wifi.wlan2g = band;
        else if (num === 5 && !wifi.wlan5g) wifi.wlan5g = band;
      }
    }
    result.push(wifi);
  }

  return result;
}

export interface WifiUpdateParams {
  deviceId: string;
  ssid2g?: string;
  pass2g?: string;
  ssid5g?: string;
  pass5g?: string;
}

export interface WifiUpdateTaskResult {
  task: string;
  status?: number;
  error?: string;
}

/** Issues the standard CWMP "Reboot" RPC via GenieACS NBI — documented, vendor-neutral
 * task type (unlike the OLT-side SNMP OIDs, this isn't something that needs on-device
 * verification first). */
export async function rebootDevice(genieacsUrl: string, deviceId: string): Promise<{ status: number }> {
  const url = `${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "reboot" }),
  });
  if (!res.ok) throw new Error(`GenieACS reboot dështoi: ${res.status}`);
  return { status: res.status };
}

export async function updateWifi(
  genieacsUrl: string,
  params: WifiUpdateParams
): Promise<WifiUpdateTaskResult[]> {
  type ParamValue = [string, string, string];
  const params2g: ParamValue[] = [];
  const params5g: ParamValue[] = [];

  if (params.ssid2g) {
    params2g.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", params.ssid2g, "xsd:string"]);
  }
  if (params.pass2g) {
    params2g.push(
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType", "11i", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.IEEE11iEncryptionModes", "AESEncryption", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.IEEE11iAuthenticationMode", "PSKAuthentication", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", params.pass2g, "xsd:string"]
    );
  }
  if (params.ssid5g) {
    params5g.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID", params.ssid5g, "xsd:string"]);
  }
  if (params.pass5g) {
    params5g.push(
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.BeaconType", "11i", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.IEEE11iEncryptionModes", "AESEncryption", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.IEEE11iAuthenticationMode", "PSKAuthentication", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase", params.pass5g, "xsd:string"]
    );
  }

  const tasks: { name: string; parameterValues: ParamValue[] }[] = [];
  if (params2g.length) tasks.push({ name: "setParameterValues", parameterValues: params2g });
  if (params5g.length) tasks.push({ name: "setParameterValues", parameterValues: params5g });

  const results: WifiUpdateTaskResult[] = [];
  for (const task of tasks) {
    const url = `${genieacsUrl}/devices/${encodeURIComponent(params.deviceId)}/tasks?connection_request`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
      results.push({ task: task.name, status: res.status });
    } catch (err) {
      results.push({ task: task.name, error: (err as Error).message });
    }
  }
  return results;
}
