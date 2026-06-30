// Ported verbatim from frontend/index.html selects + main.py defaults.
export const ONU_TYPES = [
  "F673AV9V9.0",
  "F660",
  "F660V6.0",
  "F670L",
  "F601",
  "ZTE-F660",
  "F6600PV9.0.12",
] as const;

export const TCONT_PROFILES = ["SMARTOLT-1G-UP", "1G", "100Mbs"] as const;

export const DEFAULT_TRAFFIC_PROFILE = "SMARTOLT-1G-DOWN";
export const DEFAULT_VLAN_ID = 40;
export const DEFAULT_ONU_NAME = "ONU_AUTO";
export const DEFAULT_ONU_TYPE: (typeof ONU_TYPES)[number] = "F660";
export const DEFAULT_TCONT_PROFILE: (typeof TCONT_PROFILES)[number] = "SMARTOLT-1G-UP";

/** Slots scanned per OLT when no explicit list is configured.
 * main.py's live `/api/get-all-onus` only scanned slot 15; sync_service.py scanned
 * these five — that mismatch was a bug. This is now the single source of truth and
 * is overridable per-OLT via `Olt.slots`. */
export const DEFAULT_OLT_SLOTS = [4, 15, 17, 19, 20];
export const DEFAULT_PORTS_PER_SLOT = 16; // ports 1..16 (GPON boards, confirmed via `show card`)

/** EPON boards (ZTE ETTO/ETTOK cards) confirmed via `show card` to have 8 PON
 * ports each, vs. 16 for GPON boards — separate from `Olt.slots`/DEFAULT_OLT_SLOTS
 * since EPON and GPON line cards live in different slots on a mixed-technology OLT. */
export const DEFAULT_EPON_PORTS_PER_SLOT = 8;

/** F612/F601 ONU models are deployed in bridge mode, F673 models in router/PPPoE
 * mode — this distinguishes business (route, router does the PPPoE auth) vs
 * residential (bridge, PPPoE auth happens upstream e.g. on a RADIUS/BRAS) clients
 * at a glance from the model alone, per office convention. */
export function onuConnectionKind(type: string | null | undefined): "bridge" | "route" | null {
  if (!type) return null;
  if (type.startsWith("F612") || type.startsWith("F601")) return "bridge";
  if (type.startsWith("F673")) return "route";
  return null;
}
