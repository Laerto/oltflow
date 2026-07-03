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
  parseFirstMac,
  parseOnuInterfaceStats,
  parseOnuMacTable,
  parseEponOnuDetail,
  parseEponRunningConfig,
  extractZteError,
  type UncfgOnu,
  type OnuMacEntry,
} from "./zte-parsers.js";
import {
  parsePonPort,
  onuInterface,
  oltInterface,
  buildAuthorizeOnuCommands,
  buildAuthorizeAndPppoeCommands,
  buildReplaceOnuCommands,
  buildDeleteOnuCommands,
  buildEnableWanAccessCommands,
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
  /** Privileged ("enable") password. Some ZTE OLTs (notably C320 over SSH) drop
   * the user into user-exec mode (>) where every command is rejected, and require
   * `enable` + this password to reach privileged mode (#). Falls back to `password`
   * when unset (OLTs whose enable password equals the login password). */
  enablePassword?: string;
}

export interface AdapterOnuRow {
  ponPort: string;
  serial: string;
  name: string;
  type: string;
  state: string;
}

/**
 * Reads a command's reply up to the next CLI prompt (`#`) instead of blocking a
 * fixed delay. The ZTE prompt always ends in `#`, and detail-info/running-config/
 * mac output never contains one, so this returns as soon as the reply lands
 * (~50ms on a healthy link) vs the old fixed 0.8s. That turns a 400+ ONU detail
 * sweep from ~15 min into ~2 min — the fixed-delay sweep overran the 15-min sync
 * interval, tripped BullMQ's stall detection, and held the OLT lock long enough
 * to starve the every-60s state pass (so a busy OLT's ONUs never gained detail).
 * `capMs` bounds a slow/silent reply so a single ONU can't hang the whole sweep.
 */
async function readReply(session: CliSession, cmd: string, capMs = 3000): Promise<string> {
  session.write(cmd);
  return session.readUntil("#", capMs);
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
    // Wait for the CLI prompt. ZTE drops some users straight into privileged mode
    // (#); others (notably C320 over SSH) land in user-exec mode (>) where commands
    // are rejected and `enable` + an enable password is needed to reach #.
    let out = await session.readUntil("#", 5000);
    if (!out.includes("#") && out.includes(">")) {
      session.write("enable");
      const prompt = await session.readUntil("Password:", 4000);
      out += prompt;
      if (prompt.includes("Password:")) {
        session.write(creds.enablePassword || creds.password);
        out += await session.readUntil("#", 5000);
      } else if (!prompt.includes("#")) {
        out += await session.readUntil("#", 3000);
      }
    }
    if (!out.includes("#")) {
      throw new Error("Hyrja (login) dështoi — kontrollo kredencialet ose enable password");
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
  mac?: string;
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
        const det = await readReply(session, `show gpon onu detail-info ${row.ponPort}`);
        const parsed = parseOnuDetail(det);
        row.serial = parsed.serial;
        row.name = parsed.name;
        row.type = parsed.type;
        row.distance = parsed.distance;
        row.onlineDuration = parsed.onlineDuration;
        row.lineProfile = parsed.lineProfile;
        row.serviceProfile = parsed.serviceProfile;

        const run = await readReply(session, `show onu running config ${row.ponPort}`);
        const runParsed = parseRunningConfig(run);
        row.pppoeUser = runParsed.pppoeUser;
        row.vlan = runParsed.vlan;

        // Learned MAC on the ONU port — for bridge ONUs this is the downstream Mikrotik,
        // the join key to RADIUS (Calling-Station-Id) for its live WAN IP.
        const macOut = await readReply(session, `show mac gpon onu ${row.ponPort}`);
        row.mac = parseFirstMac(macOut);
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

/** Full EPON inventory: state per port, then per-ONU detail-info (name/type/MAC) and
 * running config (voip PPPoE username/VLAN). EPON uses a different CLI shape than GPON. */
export async function scanEponInventory(
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
            serial: r.mac, // EPON has no SN; MAC is the identity
          });
        }
      }
    }
    for (const row of rows) {
      try {
        const det = await readReply(session, `show onu detail-info ${row.ponPort}`);
        const d = parseEponOnuDetail(det);
        row.name = d.name;
        row.type = d.type;
        if (d.mac) row.mac = d.mac;

        const run = await readReply(session, `show onu running config ${row.ponPort}`);
        const rc = parseEponRunningConfig(run);
        row.pppoeUser = rc.pppoeUser;
        row.vlan = rc.vlan;
      } catch {
        // per-ONU best-effort, matching the GPON path
      }
    }
    return rows;
  } finally {
    session.close();
  }
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

export interface OnuLiveResult {
  onuInterface: string;
  upBps: number;
  downBps: number;
  upPps: number;
  downPps: number;
  totalUpBytes: number;
  totalDownBytes: number;
  macs: OnuMacEntry[];
}

/** Live per-ONU snapshot for the on-demand "View" panel: instantaneous traffic rate
 * (`show interface`) + the downstream MAC table (`show mac gpon onu`). Two fast read-only
 * commands — cheap enough to poll every few seconds while an operator watches one ONU. */
export async function getOnuLive(creds: OltCreds, ponPort: string): Promise<OnuLiveResult> {
  const iface = onuInterface(parsePonPort(ponPort));
  const session = await login(creds);
  let statsOut: string, macOut: string;
  try {
    await session.sendCommand("terminal length 0", 500);
    statsOut = await session.sendCommand(`show interface ${iface}`, 1500);
    macOut = await session.sendCommand(`show mac gpon onu ${iface}`, 1500);
  } finally {
    session.close();
  }
  const stats = parseOnuInterfaceStats(statsOut);
  return { onuInterface: iface, ...stats, macs: parseOnuMacTable(macOut) };
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
    // Strict PPPoE injection: login() already put us in privileged mode, so we enter
    // config, then `pon-onu-mng <onu>` and WAIT until the prompt actually shows the
    // `gpon-onu-mng .../...:N` context before sending the pppoe line. This guarantees
    // the pppoe command can never land in (config)# ("%Error Ambiguous command") due to
    // the OLT being a beat slow — the failure mode we kept hitting with fixed delays.
    const onu = onuInterface(params.pon);
    let output = await session.sendCommand("configure terminal", 900);
    session.write(`pon-onu-mng ${onu}`);
    const ctx = await session.readUntil("gpon-onu-mng", 6000);
    output += ctx;
    if (!ctx.includes("gpon-onu-mng")) {
      const err = extractZteError(ctx);
      throw new Error(
        err
          ? `OLT refuzoi komandën: ${err}`
          : `Nuk u hy në kontekstin pon-onu-mng për ${onu} — a është ONU e autorizuar?`
      );
    }
    output += await session.sendCommand(
      `pppoe 1 nat enable user ${params.pppoeUsername} password ${params.pppoePassword}`,
      1200
    );
    output += await session.sendCommand("!", 800);
    output += await session.sendCommand("end", 800);
    output += await session.sendCommand("write", 2500);
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

export async function enableWanAccess(
  creds: OltCreds,
  params: { pon: PonPort }
): Promise<{ output: string; onuInterface: string }> {
  const session = await login(creds);
  try {
    // Same strict, context-verified injection as setPppoe: confirm we're inside the ONU's
    // pon-onu-mng context before applying the security-mgmt WAN rules.
    const onu = onuInterface(params.pon);
    let output = await session.sendCommand("configure terminal", 900);
    session.write(`pon-onu-mng ${onu}`);
    const ctx = await session.readUntil("gpon-onu-mng", 6000);
    output += ctx;
    if (!ctx.includes("gpon-onu-mng")) {
      const err = extractZteError(ctx);
      throw new Error(
        err
          ? `OLT refuzoi komandën: ${err}`
          : `Nuk u hy në kontekstin pon-onu-mng për ${onu} — a është ONU e autorizuar?`
      );
    }
    for (const cmd of buildEnableWanAccessCommands()) {
      output += await session.sendCommand(cmd, 1000);
    }
    output += await session.sendCommand("!", 800);
    output += await session.sendCommand("end", 800);
    output += await session.sendCommand("write", 2500);
    return ensureApplied(output, params.pon);
  } finally {
    session.close();
  }
}

/**
 * Pushes the TR-069 ACS URL into many ONUs in a SINGLE login session (unlock + acs URL
 * inside each ONU's pon-onu-mng context), then one `write`. Used to bulk-fix ONUs that
 * were provisioned with an unreachable ACS URL so they start informing GenieACS.
 */
export async function pushAcsUrl(
  creds: OltCreds,
  ponPorts: string[],
  acsUrl: string
): Promise<{ updated: number; failed: string[]; output: string }> {
  const session = await login(creds);
  let updated = 0;
  const failed: string[] = [];
  let output = "";
  try {
    for (const ponPort of ponPorts) {
      const onu = onuInterface(parsePonPort(ponPort));
      output += await session.sendCommand("configure terminal", 500);
      session.write(`pon-onu-mng ${onu}`);
      const ctx = await session.readUntil("gpon-onu-mng", 5000);
      output += ctx;
      if (!ctx.includes("gpon-onu-mng")) {
        failed.push(ponPort);
        output += await session.sendCommand("end", 400);
        continue;
      }
      output += await session.sendCommand("tr069-mgmt 1 state unlock", 600);
      output += await session.sendCommand(`tr069-mgmt 1 acs ${acsUrl}`, 600);
      output += await session.sendCommand("end", 400);
      updated += 1;
    }
    output += await session.sendCommand("write", 3000);
    return { updated, failed, output };
  } finally {
    session.close();
  }
}

/** Reboots an ONU from the OLT CLI (works for GPON & EPON, TR-069 not required):
 * `pon-onu-mng <onu>` → `reboot` → answer the `Confirm to reboot? [yes/no]:` prompt. */
export async function rebootOnuCli(creds: OltCreds, ponPort: string): Promise<{ output: string }> {
  const session = await login(creds);
  try {
    let output = await session.sendCommand("configure terminal", 800);
    session.write(`pon-onu-mng ${ponPort}`);
    const ctx = await session.readUntil("onu-mng", 6000);
    output += ctx;
    if (!ctx.includes("onu-mng")) {
      throw new Error(`Nuk u hy në kontekstin pon-onu-mng për ${ponPort}`);
    }
    session.write("reboot");
    const confirm = await session.readUntil("Confirm", 5000);
    output += confirm;
    if (confirm.includes("Confirm")) {
      output += await session.sendCommand("yes", 2500);
    }
    output += await session.sendCommand("end", 600);
    const err = extractZteError(output);
    if (err) throw new Error(`OLT refuzoi komandën: ${err}`);
    return { output };
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
