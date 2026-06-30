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
