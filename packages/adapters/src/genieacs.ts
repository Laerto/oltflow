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

  // Always query GenieACS in serial-filtered batches (an `_id` regex per chunk — the ids
  // embed the serial) instead of ever pulling the ENTIRE device tree. A big OLT (hundreds
  // of serials) used to download the whole ACS on every list load, which made that OLT's
  // ONU list crawl and its signal filters feel broken until it finally arrived. Chunking
  // keeps each request URL small; the batches run in parallel and a failed one is skipped.
  // (The real scale fix is still a syncAcs→Postgres mirror.)
  const projection =
    "_id,InternetGatewayDevice.WANDevice,InternetGatewayDevice.ManagementServer.ConnectionRequestURL";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const CHUNK = 40;
  const chunks: string[][] = [];
  for (let i = 0; i < wanted.length; i += CHUNK) chunks.push(wanted.slice(i, i + CHUNK));

  await Promise.all(
    chunks.map(async (batch) => {
      const query = { _id: { $regex: batch.map(esc).join("|") } };
      const res = await fetch(devicesUrl(genieacsUrl, { query, projection })).catch(() => null);
      if (!res || !res.ok) return; // skip a failed batch, keep the rest
      const devices = (await res.json()) as GenieDevice[];
      for (const d of devices) {
        const id = String(d._id ?? "").toUpperCase();
        const matchedSerial = batch.find((sn) => id.includes(sn));
        if (!matchedSerial || result.has(matchedSerial)) continue;
        const ip = extractWanIp(d);
        if (ip) result.set(matchedSerial, ip);
      }
    })
  );
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

export interface WifiClient {
  mac: string;
  name: string | null;
  band: "2.4G" | "5G";
  rxRate: number | null; // kbps
  snr: number | null; // dB
}

/** Live wireless clients associated to the CPE's WiFi (WLANConfiguration.{i}.AssociatedDevice) —
 * so support sees exactly what's connected over WiFi instead of guessing. Instances 1-4 = 2.4G,
 * 5-8 = 5G on ZTE. Best-effort; [] if the tree is absent. */
export async function getWifiClients(genieacsUrl: string, deviceId: string): Promise<WifiClient[]> {
  const res = await fetch(
    devicesUrl(genieacsUrl, {
      query: { _id: deviceId },
      projection: "InternetGatewayDevice.LANDevice.1.WLANConfiguration",
    })
  ).catch(() => null);
  if (!res || !res.ok) return [];
  const devices = (await res.json()) as GenieDevice[];
  const wlan = deepGet(devices[0], "InternetGatewayDevice", "LANDevice", "1", "WLANConfiguration") as
    | Record<string, unknown>
    | undefined;
  if (!wlan) return [];
  const numOrNull = (x: unknown): number | null => (x == null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));
  const clients: WifiClient[] = [];
  for (const [idx, wv] of Object.entries(wlan)) {
    if (!/^\d+$/.test(idx)) continue;
    const band: "2.4G" | "5G" = Number(idx) >= 5 ? "5G" : "2.4G";
    const assoc = deepGet(wv, "AssociatedDevice") as Record<string, unknown> | undefined;
    if (!assoc) continue;
    for (const [aidx, av] of Object.entries(assoc)) {
      if (!/^\d+$/.test(aidx)) continue;
      const mac = (deepGet(av, "X_ZTE-COM_MACAddress", "_value") ?? deepGet(av, "AssociatedDeviceMACAddress", "_value")) as string | undefined;
      if (!mac || !/[0-9a-f]{2}:/i.test(String(mac))) continue;
      clients.push({
        mac: String(mac),
        name: (deepGet(av, "X_ZTE-COM_AssociatedDeviceName", "_value") as string) || null,
        band,
        rxRate: numOrNull(deepGet(av, "X_ZTE-COM_RXRate", "_value")),
        snr: numOrNull(deepGet(av, "X_ZTE-COM_WLAN_SNR", "_value")),
      });
    }
  }
  return clients;
}

export interface LanPort {
  /** 1-based physical port index → LAN1..LAN4. */
  port: number;
  /** Link up (cable connected). Status "Up" ⇒ true; "NoLink"/"Down"/"Disabled" ⇒ false. */
  up: boolean;
  /** Whether the port is administratively enabled. */
  enabled: boolean;
  name: string | null;
}

/** Live per-port physical LAN status (LANEthernetInterfaceConfig) for the ONU/CPE — used to
 * draw the LAN1..LAN4 port strip. Best-effort; returns [] if the tree/param is absent. */
export async function getLanPorts(genieacsUrl: string, deviceId: string): Promise<LanPort[]> {
  const res = await fetch(
    devicesUrl(genieacsUrl, {
      query: { _id: deviceId },
      projection: "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig",
    })
  ).catch(() => null);
  if (!res || !res.ok) return [];
  const devices = (await res.json()) as GenieDevice[];
  const cfg = deepGet(devices[0], "InternetGatewayDevice", "LANDevice", "1", "LANEthernetInterfaceConfig") as
    | Record<string, unknown>
    | undefined;
  if (!cfg) return [];
  const ports: LanPort[] = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (!/^\d+$/.test(k)) continue;
    const status = deepGet(v, "Status", "_value");
    const name = deepGet(v, "Name", "_value");
    const enable = deepGet(v, "Enable", "_value");
    ports.push({
      port: Number(k),
      up: status === "Up",
      enabled: enable === true || enable === "true" || enable === 1,
      name: typeof name === "string" ? name : null,
    });
  }
  ports.sort((a, b) => a.port - b.port);
  return ports;
}

export interface WifiUpdateParams {
  deviceId: string;
  ssid2g?: string;
  pass2g?: string;
  ssid5g?: string;
  pass5g?: string;
  /** Radio on/off per band (WLANConfiguration.Enable). Omitted ⇒ leave unchanged. */
  enable2g?: boolean;
  enable5g?: boolean;
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

/** Issues a FactoryReset CWMP task via GenieACS NBI. */
export async function factoryResetDevice(
  genieacsUrl: string,
  deviceId: string
): Promise<{ status: number }> {
  const url = `${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "factoryReset" }),
  });
  if (!res.ok) throw new Error(`GenieACS factoryReset dështoi: ${res.status}`);
  return { status: res.status };
}

/** Ask the CPE to refresh a subtree on next inform (summon + refreshObject). */
export async function refreshDeviceObject(
  genieacsUrl: string,
  deviceId: string,
  objectName = "InternetGatewayDevice"
): Promise<{ status: number }> {
  const url = `${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "refreshObject", objectName }),
  });
  if (!res.ok) throw new Error(`GenieACS refreshObject dështoi: ${res.status}`);
  return { status: res.status };
}

// ── ACS mirror helpers (Phase 6) ─────────────────────────────────────────────

export interface LanHost {
  hostname: string | null;
  mac: string | null;
  ip: string | null;
  active: boolean;
}

export interface AcsDeviceSummary {
  deviceId: string;
  serial: string | null;
  productClass: string | null;
  modelName: string | null;
  hardwareVersion: string | null;
  softwareVersion: string | null;
  wanIp: string | null;
  wanMode: string | null;
  uptimeSec: number | null;
  ssid2g: string | null;
  ssid5g: string | null;
  wifiEnabled2g: boolean | null;
  wifiEnabled5g: boolean | null;
  lanHosts: LanHost[];
  lastInform: Date | null;
  lastBootstrap: Date | null;
}

const MIRROR_PROJECTION = [
  "_id",
  "_deviceId",
  "_lastInform",
  "_lastBootstrap",
  "_registered",
  "InternetGatewayDevice.DeviceInfo",
  "InternetGatewayDevice.WANDevice",
  "InternetGatewayDevice.LANDevice",
  "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
].join(",");

function valStr(...path: string[]): (d: GenieDevice) => string | null {
  return (d) => {
    const v = deepGet(d, ...path, "_value");
    return typeof v === "string" && v.length ? v : null;
  };
}

function extractSerial(d: GenieDevice): string | null {
  const sn = valStr("InternetGatewayDevice", "DeviceInfo", "SerialNumber")(d);
  if (sn) return sn.toUpperCase();
  // GenieACS ids often look like OUI-SERIAL-PRODUCTCLASS
  const id = String(d._id ?? "");
  const parts = id.split("-");
  if (parts.length >= 2 && parts[1] && parts[1].length >= 8) return parts[1]!.toUpperCase();
  return null;
}

function extractWanMode(d: GenieDevice): string | null {
  const wanDevices = deepGet(d, "InternetGatewayDevice", "WANDevice") as Record<string, unknown> | undefined;
  if (!wanDevices) return null;
  for (const wan of Object.values(wanDevices)) {
    const connDevices = deepGet(wan, "WANConnectionDevice") as Record<string, unknown> | undefined;
    if (!connDevices) continue;
    for (const connDevice of Object.values(connDevices)) {
      const ppp = deepGet(connDevice, "WANPPPConnection") as Record<string, unknown> | undefined;
      if (ppp) {
        for (const conn of Object.values(ppp)) {
          const en = deepGet(conn, "Enable", "_value");
          if (en === true || en === "true" || en === 1) return "PPPoE";
        }
      }
      const ip = deepGet(connDevice, "WANIPConnection") as Record<string, unknown> | undefined;
      if (ip) {
        for (const conn of Object.values(ip)) {
          const en = deepGet(conn, "Enable", "_value");
          if (en === true || en === "true" || en === 1) {
            const at = deepGet(conn, "AddressingType", "_value");
            return typeof at === "string" ? at : "DHCP";
          }
        }
      }
    }
  }
  return null;
}

function extractLanHosts(d: GenieDevice): LanHost[] {
  const hosts: LanHost[] = [];
  const lanDevices = deepGet(d, "InternetGatewayDevice", "LANDevice") as Record<string, unknown> | undefined;
  if (!lanDevices) return hosts;
  for (const lan of Object.values(lanDevices)) {
    const hostsObj = deepGet(lan, "Hosts", "Host") as Record<string, unknown> | undefined;
    if (!hostsObj) continue;
    for (const h of Object.values(hostsObj)) {
      if (!h || typeof h !== "object") continue;
      const hostname = deepGet(h, "HostName", "_value");
      const mac = deepGet(h, "MACAddress", "_value");
      const ip = deepGet(h, "IPAddress", "_value");
      const active = deepGet(h, "Active", "_value");
      if (!mac && !ip) continue;
      hosts.push({
        hostname: typeof hostname === "string" ? hostname : null,
        mac: typeof mac === "string" ? mac : null,
        ip: typeof ip === "string" ? ip : null,
        active: active === true || active === "true" || active === 1,
      });
    }
  }
  return hosts;
}

function extractWifiBands(d: GenieDevice): {
  ssid2g: string | null;
  ssid5g: string | null;
  wifiEnabled2g: boolean | null;
  wifiEnabled5g: boolean | null;
} {
  let ssid2g: string | null = null;
  let ssid5g: string | null = null;
  let wifiEnabled2g: boolean | null = null;
  let wifiEnabled5g: boolean | null = null;
  const lanDevices = deepGet(d, "InternetGatewayDevice", "LANDevice") as Record<string, unknown> | undefined;
  if (!lanDevices) return { ssid2g, ssid5g, wifiEnabled2g, wifiEnabled5g };
  for (const lan of Object.values(lanDevices)) {
    const wlanCfg = deepGet(lan, "WLANConfiguration") as Record<string, unknown> | undefined;
    if (!wlanCfg) continue;
    for (const [idx, wv] of Object.entries(wlanCfg)) {
      const ssid = deepGet(wv, "SSID", "_value");
      const toBool = (x: unknown): boolean | null =>
        x === true || x === "true" || x === 1 ? true : x === false || x === "false" || x === 0 ? false : null;
      const en = toBool(deepGet(wv, "Enable", "_value"));
      // On ZTE the physical radio (RadioEnabled) is the real on/off; WiFi is up for the client
      // only when both the radio is powered and the BSS is enabled. Either explicitly off ⇒ off.
      const radio = toBool(deepGet(wv, "RadioEnabled", "_value"));
      const enabled = en === false || radio === false ? false : en === true || radio === true ? true : null;
      const s = typeof ssid === "string" && !ssid.startsWith("SSID") ? ssid : null;
      const n = Number.parseInt(idx, 10);
      if (n === 1) {
        ssid2g = s;
        wifiEnabled2g = enabled;
      } else if (n === 5) {
        ssid5g = s;
        wifiEnabled5g = enabled;
      }
    }
  }
  return { ssid2g, ssid5g, wifiEnabled2g, wifiEnabled5g };
}

function parseGenieDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function summarizeGenieDevice(d: GenieDevice): AcsDeviceSummary {
  const uptime = deepGet(d, "InternetGatewayDevice", "DeviceInfo", "UpTime", "_value");
  const wifi = extractWifiBands(d);
  return {
    deviceId: String(d._id ?? ""),
    serial: extractSerial(d),
    productClass: valStr("InternetGatewayDevice", "DeviceInfo", "ProductClass")(d),
    modelName: valStr("InternetGatewayDevice", "DeviceInfo", "ModelName")(d),
    hardwareVersion: valStr("InternetGatewayDevice", "DeviceInfo", "HardwareVersion")(d),
    softwareVersion: valStr("InternetGatewayDevice", "DeviceInfo", "SoftwareVersion")(d),
    wanIp: extractWanIp(d) ?? null,
    wanMode: extractWanMode(d),
    uptimeSec: typeof uptime === "number" ? uptime : typeof uptime === "string" ? Number(uptime) || null : null,
    ...wifi,
    lanHosts: extractLanHosts(d),
    lastInform: parseGenieDate(d._lastInform),
    lastBootstrap: parseGenieDate(d._lastBootstrap),
  };
}

/** Paginated device list for the mirror worker (projection keeps payloads small). */
export async function listGenieDevices(
  genieacsUrl: string,
  opts?: { skip?: number; limit?: number; serial?: string }
): Promise<AcsDeviceSummary[]> {
  const query = opts?.serial ? { _id: { $regex: opts.serial.toUpperCase() } } : undefined;
  const qs = new URLSearchParams();
  if (query) qs.set("query", JSON.stringify(query));
  qs.set("projection", MIRROR_PROJECTION);
  if (opts?.skip != null) qs.set("skip", String(opts.skip));
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  const res = await fetch(`${genieacsUrl.replace(/\/$/, "")}/devices?${qs}`);
  if (!res.ok) throw new Error(`GenieACS list failed: ${res.status}`);
  const devices = (await res.json()) as GenieDevice[];
  return devices.map(summarizeGenieDevice).filter((d) => d.deviceId);
}

/** Count devices in GenieACS (HEAD or empty projection count via full list size — GenieACS has no count endpoint; use devices?projection=_id). */
export async function countGenieDevices(genieacsUrl: string): Promise<number> {
  const res = await fetch(
    devicesUrl(genieacsUrl.replace(/\/$/, ""), { projection: "_id" })
  );
  if (!res.ok) throw new Error(`GenieACS count failed: ${res.status}`);
  const devices = (await res.json()) as unknown[];
  return devices.length;
}

export async function updateWifi(
  genieacsUrl: string,
  params: WifiUpdateParams
): Promise<WifiUpdateTaskResult[]> {
  type ParamValue = [string, string, string];
  const params2g: ParamValue[] = [];
  const params5g: ParamValue[] = [];

  if (params.enable2g !== undefined) {
    // ZTE (F673AV9 & family): the "WLAN On/Off" master is the physical radio (RadioEnabled);
    // Enable alone only toggles the BSS/SSID and leaves the radio off — the client sees no
    // change. Set both so the radio powers on and the SSID broadcasts.
    const v = params.enable2g ? "true" : "false";
    params2g.push(
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.RadioEnabled", v, "xsd:boolean"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable", v, "xsd:boolean"]
    );
  }
  if (params.ssid2g) {
    params2g.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", params.ssid2g, "xsd:string"]);
  }
  if (params.pass2g) {
    // ZTE F673AV9 exposes the WPA passphrase at WLANConfiguration.{i}.KeyPassphrase — it does NOT
    // have PreSharedKey.1.KeyPassphrase, so setting that path faulted the whole task (cwmp.9003
    // Invalid arguments) and the password never changed while the SSID did. Use KeyPassphrase.
    params2g.push(
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType", "11i", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.IEEE11iEncryptionModes", "AESEncryption", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.IEEE11iAuthenticationMode", "PSKAuthentication", "xsd:string"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", params.pass2g, "xsd:string"]
    );
  }
  if (params.enable5g !== undefined) {
    // See enable2g note — RadioEnabled is the actual on/off on ZTE; set both.
    const v = params.enable5g ? "true" : "false";
    params5g.push(
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.RadioEnabled", v, "xsd:boolean"],
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Enable", v, "xsd:boolean"]
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
      ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase", params.pass5g, "xsd:string"]
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
