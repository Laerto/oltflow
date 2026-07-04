import { parseAttenuationOutput, type ParsedSignal } from "@oltflow/core";

export interface UncfgOnu {
  ponPort: string;
  serial: string;
  state: string;
}

/**
 * ZTE C300/C320 CLI reports rejected commands with a `%Error <code>: <text>` line
 * (e.g. `%Error 20204: Ambiguous command`). Returns the joined error text if the
 * output contains any such line, else null. Write operations (authorize/pppoe/...)
 * use this to FAIL the job with the device's real message instead of reporting a
 * false success when the device silently rejected the commands.
 */
export function extractZteError(output: string): string | null {
  const errors: string[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^%Error\b/i.test(line)) errors.push(line.replace(/\s+/g, " "));
  }
  return errors.length ? errors.join(" | ") : null;
}

/** Parses `show onu detail-info epon-onu_...` (EPON format differs from GPON — key: value
 * lines with OnuType / NAME / MAC). */
export function parseEponOnuDetail(raw: string): { type?: string; name?: string; mac?: string } {
  const grab = (label: string): string | undefined => {
    const m = new RegExp(`^\\s*${label}\\s*:\\s*(.+?)\\s*$`, "im").exec(raw);
    const v = m?.[1]?.trim();
    return v && v.length ? v : undefined;
  };
  return { type: grab("OnuType"), name: grab("NAME"), mac: grab("MAC") };
}

/** Parses an EPON ONU running config for the PPPoE username / VLAN. ZTE EPON carries PPPoE
 * in one of two places: bridge/voip ONUs put it under the voip module
 * (`voip pppoe username <u> password <p>`), while route CPEs (e.g. F460) put it in the WAN
 * section exactly like GPON (`pppoe 1 nat enable user <u> password <p>`). Without the WAN
 * fallback, route EPON ONUs get no username → no RADIUS match → no WAN IP in the panel. */
export function parseEponRunningConfig(raw: string): { pppoeUser?: string; vlan?: string } {
  const voip = /voip\s+pppoe\s+username\s+(\S+)/i.exec(raw);
  const wan = /pppoe\s+1\s+nat\s+enable\s+user\s+(\S+)/i.exec(raw);
  const v = /pppoe_vlan_(\d+)/i.exec(raw);
  return { pppoeUser: voip?.[1] ?? wan?.[1], vlan: v?.[1] };
}

/** Parses the first MAC address from `show mac gpon onu <onu>` output (ZTE dotted form
 * dc2c.6e1a.7e1b). For a bridge ONU this is the downstream device (customer Mikrotik). */
export function parseFirstMac(raw: string): string | undefined {
  const m = /\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\b/.exec(raw);
  return m ? m[1].toLowerCase() : undefined;
}

/** Parses `show gpon onu uncfg` output. */
export function parseUncfg(raw: string): UncfgOnu[] {
  const onus: UncfgOnu[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = /^(\S+)\s+(\S+)\s+(\S+)/.exec(line);
    if (m && m[1].includes("gpon-onu")) {
      onus.push({ ponPort: m[1], serial: m[2], state: m[3] });
    }
  }
  return onus;
}

/**
 * Parses ZTE EPON `show onu unauthentication` — waiting-authorization ONUs on EPON boards.
 * Unlike GPON's tabular `show gpon onu uncfg`, EPON prints a repeated key:value BLOCK per
 * ONU, each anchored by `Onu Interface : epon-onu_F/S/P:N`:
 *
 *   Onu Interface  :  epon-onu_1/2/3:1
 *   Onu Model      :  ZTE-F661
 *   MAC Address    :  bcf8.8b45.ebcc
 *   Online State   :  authentication deny
 *   RegTime        :  2026/07/04 11:39:48
 *
 * EPON ONUs have no GPON-style serial, so the MAC is used as `serial` — this slots the row
 * into the same UncfgOnu shape / Waiting-Authorization list as GPON. Only `epon-onu_` rows
 * are kept (the command can echo the prompt/other lines).
 */
export function parseEponUnauth(raw: string): UncfgOnu[] {
  const onus: UncfgOnu[] = [];
  let cur: Record<string, string> | null = null;
  const flush = () => {
    if (cur) {
      const iface = cur["onu interface"];
      const mac = cur["mac address"];
      if (iface && iface.startsWith("epon-onu") && mac) {
        onus.push({ ponPort: iface, serial: mac, state: cur["online state"] || "unauth" });
      }
    }
    cur = null;
  };
  for (const rawLine of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z][A-Za-z ]+?)\s*:\s*(.*)$/.exec(rawLine);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    if (key === "onu interface") flush(); // new block starts
    (cur ??= {})[key] = m[2].trim();
  }
  flush();
  return onus;
}

/** Extracts the assigned onu-ids from `show running-config interface epon-olt_...`, whose
 * bind lines read `onu <id> type <type> mac <mac> ...`. Used by the EPON authorize path to
 * pick the first free id so a new ONU can't collide with an existing one. */
export function parseEponBoundIds(raw: string): number[] {
  const ids: number[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const m = /^\s*onu\s+(\d+)\s+type\b/i.exec(rawLine);
    if (m) ids.push(Number(m[1]));
  }
  return ids;
}

export interface OnuStateRow {
  ponPort: string;
  state: string;
}

/**
 * Parses `show gpon onu state <olt-iface>` output. Column count/prefix varies by
 * firmware: some boards print `1/15/1:1  AdminState  State` (3 cols, no prefix),
 * others print `gpon-onu_1/17/1:1  AdminState  OMCCState  O7State  PhaseState` (5
 * cols, prefixed) — observed on a real OLT where the old fixed-column-index parse
 * silently grabbed "O7 State" instead of the actual working/offline column and
 * returned zero usable rows. Matching the *last* token is robust to both: the
 * working/offline/DyingGasp/LOS indicator is always the final column either way.
 *
 * A third variant adds a trailing Channel column after Phase State, e.g.
 * `1/15/9:1  enable  enable  working  1(GPON)` — observed on another real OLT
 * where the last-token rule above grabbed "1(GPON)" instead of "working",
 * making every ONU show as offline despite being online with good signal.
 * Strip a trailing `N(...)` channel token before taking the last token.
 */
export function parseOnuState(raw: string): OnuStateRow[] {
  const rows: OnuStateRow[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = /^(?:gpon-onu_)?(\d+\/\d+\/\d+:\d+)\s+(\S.*\S|\S)$/.exec(line);
    if (m) {
      const tokens = m[2].trim().split(/\s+/);
      if (tokens.length > 1 && /^\d+\(.+\)$/.test(tokens[tokens.length - 1])) {
        tokens.pop();
      }
      rows.push({ ponPort: `gpon-onu_${m[1]}`, state: tokens[tokens.length - 1] });
    }
  }
  return rows;
}

export interface EponOnuStateRow {
  ponPort: string;
  onlineStatus: string; // Online | Offline | Power Off
  oamStatus: string; // complete | idle | unknown
  mac: string;
}

/**
 * Parses `show epon onu state <epon-olt-iface>` output, e.g.:
 *   epon-onu_1/9/1:6   Power Off    idle         0000.0000.0000
 *   epon-onu_1/9/1:2   Online       complete     d874.959b.2a0b
 * OnlineStatus can be one or two words ("Online" vs "Power Off"), so it can't
 * be split by fixed token position from the left — anchor on the two known
 * single-token trailing columns (OamStatus, MAC) instead and take whatever's
 * left as the status.
 */
const EPON_LINE_RE = /^epon-onu_(\d+\/\d+\/\d+:\d+)\s+(.+?)\s+(\S+)\s+(\S+)$/;

export function parseEponOnuState(raw: string): EponOnuStateRow[] {
  const rows: EponOnuStateRow[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = EPON_LINE_RE.exec(line);
    if (m) {
      rows.push({ ponPort: `epon-onu_${m[1]}`, onlineStatus: m[2], oamStatus: m[3], mac: m[4] });
    }
  }
  return rows;
}

export interface OnuDetail {
  name?: string;
  type?: string;
  state?: string;
  configState?: string;
  serial?: string;
  distance?: string;
  onlineDuration?: string;
  lineProfile?: string;
  serviceProfile?: string;
  adminState?: string;
  dbaMode?: string;
}

const DETAIL_FIELDS: Record<keyof OnuDetail, RegExp> = {
  name: /Name:\s+(.+)/,
  type: /Type:\s+(\S+)/,
  state: /Phase state:\s+(\S+)/,
  configState: /Config state:\s+(\S+)/,
  serial: /Serial number:\s+(\S+)/,
  distance: /ONU Distance:\s+(\S+)/,
  onlineDuration: /Online Duration:\s+(.+?)\r/,
  lineProfile: /Line Profile:\s+(\S+)/,
  serviceProfile: /Service Profile:\s+(\S+)/,
  adminState: /Admin state:\s+(\S+)/,
  dbaMode: /DBA Mode:\s+(\S+)/,
};

/** Parses `show gpon onu detail-info <onu-iface>` output. */
export function parseOnuDetail(raw: string): OnuDetail {
  const result: OnuDetail = {};
  for (const [key, re] of Object.entries(DETAIL_FIELDS) as [keyof OnuDetail, RegExp][]) {
    const m = re.exec(raw);
    if (m) result[key] = m[1].trim();
  }
  return result;
}

export interface ConnectionHistoryEntry {
  authTime: string;
  offlineTime: string;
  cause: string;
}

const HISTORY_RE =
  /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}|0000\S*)\s+(\S+)/g;

/** Parses the connection-history table embedded in `show gpon onu detail-info` output. */
export function parseConnectionHistory(raw: string): ConnectionHistoryEntry[] {
  const history: ConnectionHistoryEntry[] = [];
  for (const m of raw.matchAll(HISTORY_RE)) {
    if (m[1].startsWith("0000-00-00")) continue;
    history.push({
      authTime: m[1],
      offlineTime: m[2].startsWith("0000") ? "-" : m[2],
      cause: m[3],
    });
  }
  return history;
}

export interface RunningConfig {
  pppoeUser?: string;
  pppoePass?: string;
  vlan?: string;
}

/** Parses `show onu running config <onu-iface>` output. */
export function parseRunningConfig(raw: string): RunningConfig {
  const result: RunningConfig = {};
  const pppoe = /pppoe 1 nat enable user (\S+) password (\S+)/.exec(raw);
  if (pppoe) {
    result.pppoeUser = pppoe[1];
    result.pppoePass = pppoe[2];
  }
  const vlan = /vlan (\d+)/.exec(raw);
  if (vlan) result.vlan = vlan[1];
  return result;
}

export function parseSignal(raw: string): ParsedSignal {
  return parseAttenuationOutput(raw);
}

export interface OnuInterfaceStats {
  upBps: number; // Input rate (upstream, from subscriber)
  downBps: number; // Output rate (downstream, to subscriber)
  upPps: number;
  downPps: number;
  totalUpBytes: number;
  totalDownBytes: number;
}

/** Parses `show interface <onu-iface>` — per-ONU live rate + total counters.
 * On ZTE, Input = upstream (from subscriber), Output = downstream (to subscriber). */
export function parseOnuInterfaceStats(raw: string): OnuInterfaceStats {
  const num = (re: RegExp): number => {
    const m = re.exec(raw);
    return m ? Number(m[1]) : 0;
  };
  // "   Input rate :   36 Bps   0 pps"  /  "   Output rate:  71 Bps  0 pps"
  const inRate = /Input rate\s*:\s*(\d+)\s*Bps\s*(\d+)\s*pps/.exec(raw);
  const outRate = /Output rate\s*:\s*(\d+)\s*Bps\s*(\d+)\s*pps/.exec(raw);
  // Total section: "Input:\n Bytes:47706326 ..." then "Output:\n Bytes:279996436 ..."
  const totalUp = /Input:\s*[\r\n]+\s*Bytes:(\d+)/.exec(raw);
  const totalDown = /Output:\s*[\r\n]+\s*Bytes:(\d+)/.exec(raw);
  return {
    upBps: inRate ? Number(inRate[1]) : 0,
    downBps: outRate ? Number(outRate[1]) : 0,
    upPps: inRate ? Number(inRate[2]) : 0,
    downPps: outRate ? Number(outRate[2]) : 0,
    totalUpBytes: totalUp ? Number(totalUp[1]) : num(/Input[\s\S]*?Bytes:(\d+)/),
    totalDownBytes: totalDown ? Number(totalDown[1]) : num(/Output[\s\S]*?Bytes:(\d+)/),
  };
}

export interface OnuMacEntry {
  mac: string; // xxxx.xxxx.xxxx (ZTE format, lowercased)
  vlan: string | null;
}

/** Parses `show mac gpon onu <onu-iface>` — the downstream MAC address table.
 * Columns: "Mac address  Vlan  Type  Port  Vc". */
export function parseOnuMacTable(raw: string): OnuMacEntry[] {
  const out: OnuMacEntry[] = [];
  const re = /\b([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\s+(\d+)?/g;
  for (const m of raw.matchAll(re)) {
    out.push({ mac: m[1].toLowerCase(), vlan: m[2] ?? null });
  }
  return out;
}
