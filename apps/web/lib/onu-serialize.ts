import type { Onu, Signal } from "@oltflow/db";
import { onuConnectionKind } from "@oltflow/core";
import { buildWinboxUrl } from "@/lib/winbox";

export type OnuWithSignals = Onu & { signals: Signal[] };

/**
 * Serializes a DB ONU (with its latest signal) into the shape the ONU list UI expects.
 * Shared by the per-OLT route and the all-OLTs route so the two never drift. `acsIp` is
 * the GenieACS WAN IP resolved by serial; `canOperate` gates the Winbox creds; `oltName`
 * is set only in the all-OLTs view so the table can show which OLT each ONU belongs to.
 */
export function serializeOnu(
  o: OnuWithSignals,
  opts: { canOperate: boolean; acsIp: string | null; oltName?: string }
) {
  const signal = o.signals[0];
  const bridge = onuConnectionKind(o.type) === "bridge";
  return {
    id: o.id,
    oltId: o.oltId,
    oltName: opts.oltName,
    ponPort: o.ponPort,
    serial: o.serial,
    name: o.name,
    type: o.type,
    state: o.state,
    distance: o.distance,
    onlineDuration: o.onlineDuration,
    vlan: o.vlan,
    pppoeUser: o.pppoeUser,
    lineProfile: o.lineProfile,
    serviceProfile: o.serviceProfile,
    mac: o.mac,
    // Bridge → Mikrotik IP for Winbox; route → shown as WAN IP below.
    mgmtIp: bridge ? o.mgmtIp : null,
    // One-click Winbox launch (bridge + operator only); null → UI falls back to copy-IP.
    winboxUrl: bridge && opts.canOperate ? buildWinboxUrl(o.mgmtIp) : null,
    expiration: o.expiration ? o.expiration.toISOString() : null,
    customer: null,
    lastSeen: o.lastSeen,
    // Route WAN IP: worker RADIUS live IP → GenieACS. Bridge shows Winbox (mgmtIp) instead.
    wanIp: bridge ? opts.acsIp : o.mgmtIp || opts.acsIp,
    onuRx: signal?.onuRx ?? null,
    onuTx: signal?.onuTx ?? null,
    oltRx: signal?.oltRx ?? null,
    oltTx: signal?.oltTx ?? null,
    attenUp: signal?.attenUp ?? null,
    attenDown: signal?.attenDown ?? null,
    signalLevel: signal?.signalLevel ?? null,
  };
}
