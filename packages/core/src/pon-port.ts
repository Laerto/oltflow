// PON port format: gpon-onu_<frame>/<slot>/<port>:<onuId>  e.g. gpon-onu_1/15/1:1
const PON_PORT_RE = /^gpon-onu_(\d+)\/(\d+)\/(\d+):(\d+)$/;
const OLT_STATE_LINE_RE = /^(\d+\/\d+\/\d+):(\d+)$/;

export interface PonPort {
  frame: number;
  slot: number;
  port: number;
  onuId: number;
}

export function parsePonPort(ponPort: string): PonPort {
  const m = PON_PORT_RE.exec(ponPort);
  if (!m) {
    throw new Error(`Format i pavlefshëm i PON Port. Pritej: gpon-onu_1/15/1:1`);
  }
  return {
    frame: Number(m[1]),
    slot: Number(m[2]),
    port: Number(m[3]),
    onuId: Number(m[4]),
  };
}

export function oltInterface(p: Pick<PonPort, "frame" | "slot" | "port">): string {
  return `gpon-olt_${p.frame}/${p.slot}/${p.port}`;
}

export function onuInterface(p: PonPort): string {
  return `gpon-onu_${p.frame}/${p.slot}/${p.port}:${p.onuId}`;
}

/** Build the PON port string from a `show gpon onu state` line like `1/15/1:1`. */
export function ponPortFromStateLine(frameSlotPort: string): string {
  return `gpon-onu_${frameSlotPort}`;
}

export function isPonPort(value: string): boolean {
  return PON_PORT_RE.test(value);
}

/** EPON ONUs (`epon-onu_F/S/P:N`) use entirely different CLI commands/interface
 * tree than GPON — provisioning/PPPoE/refresh write-paths are GPON-only (see
 * zte-c300.ts); UI should gate those actions off for EPON rows rather than send
 * GPON commands against an EPON interface. */
export function isEponPort(ponPort: string): boolean {
  return ponPort.startsWith("epon-onu_");
}

// EPON port format: epon-onu_<frame>/<slot>/<port>:<onuId>  e.g. epon-onu_1/2/3:1
const EPON_PORT_RE = /^epon-onu_(\d+)\/(\d+)\/(\d+):(\d+)$/;

/** Parses an EPON ONU port `epon-onu_F/S/P:N`. NOTE: for an *unauthenticated* ONU the `:N`
 * is a placeholder the OLT shows before binding — the real onu-id is chosen at authorize
 * time (first free id on the parent), so callers that authorize must not trust `onuId`. */
export function parseEponPort(ponPort: string): PonPort {
  const m = EPON_PORT_RE.exec(ponPort);
  if (!m) throw new Error(`Format i pavlefshëm i EPON Port. Pritej: epon-onu_1/2/3:1`);
  return { frame: Number(m[1]), slot: Number(m[2]), port: Number(m[3]), onuId: Number(m[4]) };
}

export function eponOltInterface(p: Pick<PonPort, "frame" | "slot" | "port">): string {
  return `epon-olt_${p.frame}/${p.slot}/${p.port}`;
}

export function eponOnuInterface(p: PonPort): string {
  return `epon-onu_${p.frame}/${p.slot}/${p.port}:${p.onuId}`;
}

/** Short display form for tables: `gpon-onu_1/15/1:1` -> `15/1:1`. Drops the
 * frame number when it's `1` (every OLT in this deployment is single-frame,
 * so the leading `1/` is constant noise in every row) — falls back to the
 * full `frame/slot/port:onuId` form for any other frame so nothing is lost. */
export function formatPonPort(ponPort: string): string {
  const stripped = ponPort.replace("gpon-onu_", "").replace("epon-onu_", "");
  return stripped.startsWith("1/") ? stripped.slice(2) : stripped;
}

export { OLT_STATE_LINE_RE };
