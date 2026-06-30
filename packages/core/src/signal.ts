export type SignalLevel = "good" | "warning" | "critical";

/** ONU RX thresholds (dBm), ported verbatim from main.py / sync_service.py. */
export const SIGNAL_THRESHOLDS = {
  good: -25, // rx >= -25
  warning: -27, // rx >= -27 and < -25
  // rx < -27 => critical
} as const;

export function classifySignal(onuRxDbm: number | null | undefined): SignalLevel | "unknown" {
  if (onuRxDbm === null || onuRxDbm === undefined || Number.isNaN(onuRxDbm)) return "unknown";
  if (onuRxDbm >= SIGNAL_THRESHOLDS.good) return "good";
  if (onuRxDbm >= SIGNAL_THRESHOLDS.warning) return "warning";
  return "critical";
}

export interface ParsedSignal {
  oltRx?: number;
  onuTx?: number;
  attenUp?: number;
  oltTx?: number;
  onuRx?: number;
  attenDown?: number;
  signalLevel?: SignalLevel;
}

const UP_RE = /up\s+Rx\s*:\s*([\-\d.]+)\(dbm\)\s+Tx\s*:\s*([\-\d.]+)\(dbm\)\s+([\d.]+)/;
const DOWN_RE = /down\s+Tx\s*:\s*([\-\d.]+)\(dbm\)\s+Rx\s*:\s*([\-\d.]+)\(dbm\)\s+([\d.]+)/;

/** Parses `show pon power attenuation <onu-iface>` output. */
export function parseAttenuationOutput(raw: string): ParsedSignal {
  const result: ParsedSignal = {};
  const up = UP_RE.exec(raw);
  if (up) {
    result.oltRx = Number(up[1]);
    result.onuTx = Number(up[2]);
    result.attenUp = Number(up[3]);
  }
  const down = DOWN_RE.exec(raw);
  if (down) {
    result.oltTx = Number(down[1]);
    result.onuRx = Number(down[2]);
    result.attenDown = Number(down[3]);
  }
  if (result.onuRx !== undefined) {
    const lvl = classifySignal(result.onuRx);
    if (lvl !== "unknown") result.signalLevel = lvl;
  }
  return result;
}
