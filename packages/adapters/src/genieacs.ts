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

/** Builds a GenieACS NBI `/devices` URL, optionally narrowing the response with a
 * MongoDB-style `query` filter and a `projection` (comma-separated parameter paths).
 * Projection is critical at scale: without it GenieACS returns each device's *entire*
 * TR-069 parameter tree, so a list page would download tens of MB per request. */
function devicesUrl(genieacsUrl: string, opts?: { query?: object; projection?: string }): string {
  const qs = new URLSearchParams();
  if (opts?.query) qs.set("query", JSON.stringify(opts.query));
  if (opts?.projection) qs.set("projection", opts.projection);
  const suffix = qs.toString();
  return `${genieacsUrl}/devices${suffix ? `?${suffix}` : ""}`;
}

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

  // Fetch the WAN subtree AND the ManagementServer connection-request URL — the latter
  // embeds the device's current WAN IP and is present/fresh for every ONU that informs,
  // even when the WANConnection.ExternalIPAddress params aren't populated.
  const res = await fetch(
    devicesUrl(genieacsUrl, {
      projection: "_id,InternetGatewayDevice.WANDevice,InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
    })
  );
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

function isUsableIp(v: unknown): v is string {
  return typeof v === "string" && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(v) && v !== "0.0.0.0" && v !== "255.255.255.255";
}

/**
 * Extracts the WAN IP from a device's TR-069 tree, trying every place a ZTE ONU can
 * expose it, in order of preference:
 *   1. WANPPPConnection.ExternalIPAddress  (routed PPPoE — the usual case)
 *   2. WANIPConnection.ExternalIPAddress   (DHCP / IPoE WAN)
 *   3. any deeper *ExternalIPAddress / *IPAddress vendor variant in the WAN subtree
 * across all WANDevice / WANConnectionDevice / connection instance indices.
 *
 * This only surfaces what the ACS *has*: for an ONU behind CGNAT the device can't be
 * reached for a connection-request, so GenieACS keeps a stale value from the last
 * inform — the live IP must then come from RADIUS accounting.
 */
function extractWanIp(d: GenieDevice): string | undefined {
  const wanDevices = deepGet(d, "InternetGatewayDevice", "WANDevice") as Record<string, unknown> | undefined;
  if (!wanDevices) return undefined;

  for (const kind of ["WANPPPConnection", "WANIPConnection"] as const) {
    for (const wan of Object.values(wanDevices)) {
      const connDevices = deepGet(wan, "WANConnectionDevice") as Record<string, unknown> | undefined;
      if (!connDevices) continue;
      for (const connDevice of Object.values(connDevices)) {
        const conns = deepGet(connDevice, kind) as Record<string, unknown> | undefined;
        if (!conns) continue;
        for (const conn of Object.values(conns)) {
          const ip = deepGet(conn, "ExternalIPAddress", "_value");
          if (isUsableIp(ip)) return ip;
        }
      }
    }
  }

  // Scan the WAN subtree for any external-IP-like parameter (vendor variants),
  // skipping gateway/dns/subnet/remote fields.
  let found: string | undefined;
  const walk = (obj: unknown, key = "") => {
    if (found || !obj || typeof obj !== "object") return;
    const rec = obj as Record<string, unknown>;
    if ("_value" in rec) {
      if (/IPAddress$/i.test(key) && !/dns|gateway|subnet|mask|remote|dhcp/i.test(key) && isUsableIp(rec._value)) {
        found = rec._value as string;
      }
      return;
    }
    for (const [k, v] of Object.entries(rec)) if (!k.startsWith("_")) walk(v, k);
  };
  walk(wanDevices);
  if (found) return found;

  // Fallback: the device's own ConnectionRequestURL host is its current WAN IP
  // (http://<wan-ip>:7547|58000/...). Present & fresh for any ONU that informs,
  // so this recovers the IP for the many devices whose ExternalIPAddress is empty.
  const cru = deepGet(d, "InternetGatewayDevice", "ManagementServer", "ConnectionRequestURL", "_value");
  if (typeof cru === "string") {
    const host = /^https?:\/\/([^:/]+)/i.exec(cru)?.[1];
    if (isUsableIp(host)) return host;
  }
  return undefined;
}

export async function getWifiInfo(genieacsUrl: string, serial: string): Promise<WifiDevice[]> {
  const sn = serial.toUpperCase();
  // Let GenieACS filter by serial (device ids embed the SN) and return only the LAN/WiFi
  // subtree, instead of pulling every device's full tree and scanning client-side.
  const res = await fetch(
    devicesUrl(genieacsUrl, {
      query: { _id: { $regex: sn } },
      projection: "_id,InternetGatewayDevice.LANDevice",
    })
  );
  if (!res.ok) throw new Error(`GenieACS /devices dështoi: ${res.status}`);
  const devices = (await res.json()) as GenieDevice[];
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
