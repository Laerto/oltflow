import type { CliSession } from "./cli-session.js";
import { connectSession } from "./session-factory.js";
import {
  parseUncfg,
  parseOnuState,
  parseEponOnuState,
  parseOnuDetail,
  parseConnectionHistory,
  parseRunningConfig,
  parseSignal,
  extractZteError,
  type UncfgOnu,
} from "./zte-parsers.js";
import {
  parsePonPort,
  onuInterface,
  oltInterface,
  buildAuthorizeOnuCommands,
  buildPppoeCommands,
  buildAuthorizeAndPppoeCommands,
  buildReplaceOnuCommands,
  buildDeleteOnuCommands,
  type AuthorizeOnuParams,
  type PppoeParams,
  type ReplaceOnuParams,
  type DeleteOnuParams,
  type PonPort,
} from "@oltflow/core";

export interface OltCreds {
  host: string;
  port: number;
  protocol: "telnet" | "ssh";
  username: string;
  password: string;
}

export interface AdapterOnuRow {
  ponPort: string;
  serial: string;
  name: string;
  type: string;
  state: string;
}

async function login(creds: OltCreds): Promise<CliSession> {
  const session = await connectSession(creds);
  try {
    // SSH authenticates at the protocol layer (session-factory.ts) — only
    // Telnet needs the Username:/Password: prompt scrape here.
    if (creds.protocol === "telnet") {
      await session.readUntil("Username:");
      session.write(creds.username);
      await session.readUntil("Password:");
      session.write(creds.password);
    }
    const out = await session.readUntil("#");
    if (!out.includes("#")) {
      throw new Error("Hyrja (login) dështoi — kontrollo kredencialet");
    }
    return session;
  } catch (err) {
    session.close();
    throw err;
  }
}

export async function testConnection(creds: OltCreds): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await login(creds);
    session.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function scanUnconfigured(creds: OltCreds): Promise<UncfgOnu[]> {
  const session = await login(creds);
  try {
    const out = await session.sendCommand("show gpon onu uncfg", 2000);
    return parseUncfg(out);
  } finally {
    session.close();
  }
}

export async function scanAllOnus(
  creds: OltCreds,
  slots: number[],
  portsPerSlot: number,
  frame = 1
): Promise<AdapterOnuRow[]> {
  const session = await login(creds);
  const onus: AdapterOnuRow[] = [];
  try {
    await session.sendCommand("terminal length 0", 500);
    for (const slot of slots) {
      for (let port = 1; port <= portsPerSlot; port++) {
        const out = await session.sendCommand(`show gpon onu state gpon-olt_${frame}/${slot}/${port}`, 500);
        for (const row of parseOnuState(out)) {
          onus.push({ ponPort: row.ponPort, serial: "-", name: "-", type: "-", state: row.state });
        }
      }
    }
  } finally {
    session.close();
  }

  if (onus.length) {
    const detailSession = await login(creds);
    try {
      await detailSession.sendCommand("terminal length 0", 500);
      for (const onu of onus) {
        const det = await detailSession.sendCommand(`show gpon onu detail-info ${onu.ponPort}`, 800);
        const parsed = parseOnuDetail(det);
        if (parsed.name) onu.name = parsed.name;
        if (parsed.serial) onu.serial = parsed.serial;
        if (parsed.type) onu.type = parsed.type;
      }
    } finally {
      detailSession.close();
    }
  }

  return onus;
}

export interface InventoryRow {
  ponPort: string;
  state: string;
  serial?: string;
  name?: string;
  type?: string;
  distance?: string;
  onlineDuration?: string;
  lineProfile?: string;
  serviceProfile?: string;
  pppoeUser?: string;
  vlan?: string;
}

/**
 * Fast state-only sweep — one `show gpon onu state` per port, no per-ONU
 * round-trip. This is the only thing that can run on a short (e.g. 60s)
 * interval once an OLT has hundreds/thousands of ONUs; the full detail
 * scan below is too slow (~1.6s/ONU) to run that often.
 */
export async function scanOltState(
  creds: OltCreds,
  slots: number[],
  portsPerSlot: number,
  frame = 1
): Promise<InventoryRow[]> {
  const session = await login(creds);
  try {
    await session.sendCommand("terminal length 0", 500);
    const rows: InventoryRow[] = [];
    for (const slot of slots) {
      for (let port = 1; port <= portsPerSlot; port++) {
        const out = await session.sendCommand(`show gpon onu state gpon-olt_${frame}/${slot}/${port}`, 500);
        for (const r of parseOnuState(out)) {
          rows.push({ ponPort: r.ponPort, state: r.state });
        }
      }
    }
    return rows;
  } finally {
    session.close();
  }
}

/**
 * EPON state-only sweep, mirrors scanOltState but against `epon-olt_` interfaces
 * and the EPON-specific output format (OnlineStatus/OamStatus/RegMac, no signal
 * data — EPON optical power isn't read via this same `show pon power attenuation`
 * path, so it's out of scope until EPON write/signal support is verified). MAC is
 * carried in `serial` since EPON ONUs have no GPON-style serial number.
 */
export async function scanOltEponState(
  creds: OltCreds,
  slots: number[],
  portsPerSlot: number,
  frame = 1
): Promise<InventoryRow[]> {
  const session = await login(creds);
  try {
    await session.sendCommand("terminal length 0", 500);
    const rows: InventoryRow[] = [];
    for (const slot of slots) {
      for (let port = 1; port <= portsPerSlot; port++) {
        const out = await session.sendCommand(`show epon onu state epon-olt_${frame}/${slot}/${port}`, 500);
        for (const r of parseEponOnuState(out)) {
          rows.push({
            ponPort: r.ponPort,
            state: r.onlineStatus === "Online" ? "working" : r.onlineStatus,
            serial: r.mac,
          });
        }
      }
    }
    return rows;
  } finally {
    session.close();
  }
}

/**
 * Full inventory sync, ported from sync_service.py's sync_olt() (state scan across
 * configurable slots/ports, then per-ONU detail-info + running-config), with the
 * mis-indented inner loop bug fixed and the slot list taken from config instead of
 * being hardcoded. Slow (~1.6s/ONU) — run on a longer interval than the state-only
 * sweep (scanOltState) once an OLT has more than a couple hundred ONUs.
 */
export async function scanOltInventory(
  creds: OltCreds,
  slots: number[],
  portsPerSlot: number,
  frame = 1
): Promise<InventoryRow[]> {
  const session = await login(creds);
  try {
    await session.sendCommand("terminal length 0", 500);

    const rows: InventoryRow[] = [];
    for (const slot of slots) {
      for (let port = 1; port <= portsPerSlot; port++) {
        const out = await session.sendCommand(`show gpon onu state gpon-olt_${frame}/${slot}/${port}`, 500);
        for (const r of parseOnuState(out)) {
          rows.push({ ponPort: r.ponPort, state: r.state });
        }
      }
    }

    for (const row of rows) {
      try {
        const det = await session.sendCommand(`show gpon onu detail-info ${row.ponPort}`, 800);
        const parsed = parseOnuDetail(det);
        row.serial = parsed.serial;
        row.name = parsed.name;
        row.type = parsed.type;
        row.distance = parsed.distance;
        row.onlineDuration = parsed.onlineDuration;
        row.lineProfile = parsed.lineProfile;
        row.serviceProfile = parsed.serviceProfile;

        const run = await session.sendCommand(`show onu running config ${row.ponPort}`, 800);
        const runParsed = parseRunningConfig(run);
        row.pppoeUser = runParsed.pppoeUser;
        row.vlan = runParsed.vlan;
      } catch {
        // Skip this ONU's detail on error, matching sync_service.py's per-ONU try/except.
      }
    }

    return rows;
  } finally {
    session.close();
  }
}

/** Per-OLT signal sweep, ported from sync_service.py's sync_signals(). */
export async function scanOltSignals(
  creds: OltCreds,
  ponPorts: string[]
): Promise<Map<string, ReturnType<typeof parseSignal>>> {
  const session = await login(creds);
  const result = new Map<string, ReturnType<typeof parseSignal>>();
  try {
    await session.sendCommand("terminal length 0", 500);
    for (const pon of ponPorts) {
      try {
        const out = await session.sendCommand(`show pon power attenuation ${pon}`, 800);
        const parsed = parseSignal(out);
        if (parsed.onuRx !== undefined) result.set(pon, parsed);
      } catch {
        // Skip this ONU's signal on error.
      }
    }
    return result;
  } finally {
    session.close();
  }
}

export interface OnuDetailResult {
  onuInterface: string;
  rawDetail: string;
  rawSignal: string;
  rawRunning: string;
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
  oltRx?: number;
  onuTx?: number;
  attenUp?: number;
  oltTx?: number;
  onuRx?: number;
  attenDown?: number;
  signalLevel?: string;
  pppoeUser?: string;
  pppoePass?: string;
  vlan?: string;
  history: { authTime: string; offlineTime: string; cause: string }[];
}

export async function getOnuDetail(creds: OltCreds, ponPort: string): Promise<OnuDetailResult> {
  const pon = parsePonPort(ponPort);
  const iface = onuInterface(pon);
  const session = await login(creds);
  let detail: string, signal: string, running: string;
  try {
    await session.sendCommand("terminal length 0", 500);
    detail = await session.sendCommand(`show gpon onu detail-info ${iface}`, 2500);
    signal = await session.sendCommand(`show pon power attenuation ${iface}`, 2000);
    running = await session.sendCommand(`show onu running config ${iface}`, 2000);
  } finally {
    session.close();
  }

  const parsedDetail = parseOnuDetail(detail);
  const parsedSignal = parseSignal(signal);
  const parsedRunning = parseRunningConfig(running);

  return {
    onuInterface: iface,
    rawDetail: detail,
    rawSignal: signal,
    rawRunning: running,
    ...parsedDetail,
    oltRx: parsedSignal.oltRx,
    onuTx: parsedSignal.onuTx,
    attenUp: parsedSignal.attenUp,
    oltTx: parsedSignal.oltTx,
    onuRx: parsedSignal.onuRx,
    attenDown: parsedSignal.attenDown,
    signalLevel: parsedSignal.signalLevel,
    pppoeUser: parsedRunning.pppoeUser,
    pppoePass: parsedRunning.pppoePass,
    vlan: parsedRunning.vlan,
    history: parseConnectionHistory(detail),
  };
}

async function runCommandSequence(session: CliSession, commands: string[]): Promise<string> {
  let output = "";
  for (const cmd of commands) {
    output += await session.sendCommand(cmd, 1200);
  }
  return output;
}

/** Returns the write result, but throws first if the device rejected any command
 * (`%Error ...`) — so a job fails with the OLT's real message instead of a false
 * "done" when nothing was actually applied. */
function ensureApplied(output: string, pon: PonPort): { output: string; onuInterface: string } {
  const err = extractZteError(output);
  if (err) throw new Error(`OLT refuzoi komandën: ${err}`);
  return { output, onuInterface: onuInterface(pon) };
}

export async function authorizeOnu(
  creds: OltCreds,
  params: AuthorizeOnuParams
): Promise<{ output: string; onuInterface: string }> {
  const session = await login(creds);
  try {
    const commands = buildAuthorizeOnuCommands(params);
    let output = await runCommandSequence(session, commands);
    output += await session.sendCommand("!", 1200);
    output += await session.sendCommand("end", 1200);
    output += await session.sendCommand("write", 2000);
    return ensureApplied(output, params.pon);
  } finally {
    session.close();
  }
}

export async function setPppoe(
  creds: OltCreds,
  params: PppoeParams
): Promise<{ output: string; onuInterface: string }> {
  const session = await login(creds);
  try {
    const commands = buildPppoeCommands(params);
    let output = await runCommandSequence(session, commands);
    output += await session.sendCommand("write", 2000);
    return ensureApplied(output, params.pon);
  } finally {
    session.close();
  }
}

export async function replaceOnu(
  creds: OltCreds,
  params: ReplaceOnuParams
): Promise<{ output: string; onuInterface: string }> {
  const session = await login(creds);
  try {
    const commands = buildReplaceOnuCommands(params);
    let output = await runCommandSequence(session, commands);
    output += await session.sendCommand("!", 1200);
    output += await session.sendCommand("end", 1200);
    output += await session.sendCommand("write", 2000);
    return ensureApplied(output, params.pon);
  } finally {
    session.close();
  }
}

export async function deleteOnu(
  creds: OltCreds,
  params: DeleteOnuParams
): Promise<{ output: string; onuInterface: string }> {
  const session = await login(creds);
  try {
    const commands = buildDeleteOnuCommands(params);
    let output = await runCommandSequence(session, commands);
    output += await session.sendCommand("!", 1200);
    output += await session.sendCommand("end", 1200);
    output += await session.sendCommand("write", 2000);
    return ensureApplied(output, params.pon);
  } finally {
    session.close();
  }
}

export async function authorizeAndPppoe(
  creds: OltCreds,
  params: AuthorizeOnuParams & PppoeParams
): Promise<{ output: string; onuInterface: string }> {
  const session = await login(creds);
  try {
    const commands = buildAuthorizeAndPppoeCommands(params);
    let output = await runCommandSequence(session, commands);
    output += await session.sendCommand("!", 1200);
    output += await session.sendCommand("end", 1200);
    output += await session.sendCommand("write", 2000);
    return ensureApplied(output, params.pon);
  } finally {
    session.close();
  }
}

export { oltInterface, onuInterface };
