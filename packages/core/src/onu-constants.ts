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

/** Office convention: the F612 / F601 / F401 models are deployed in bridge mode
 * (PPPoE auth happens upstream on the customer's own router / BRAS); every other
 * ZTE model is deployed routed (the ONU itself does the PPPoE). Distinguishes the
 * two at a glance from the model alone. A leading "ZTE-" prefix is ignored. */
export function onuConnectionKind(type: string | null | undefined): "bridge" | "route" | null {
  if (!type) return null;
  const model = type.trim().toUpperCase().replace(/^ZTE-/, "");
  if (model.startsWith("F612") || model.startsWith("F601") || model.startsWith("F401")) return "bridge";
  return "route";
}
