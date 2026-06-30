import { onuInterface, oltInterface, type PonPort } from "./pon-port.js";
import { DEFAULT_TRAFFIC_PROFILE, DEFAULT_VLAN_ID } from "./onu-constants.js";

export interface AuthorizeOnuParams {
  pon: PonPort;
  onuSerial: string;
  onuName: string;
  onuType: string;
  tcontProfile: string;
  trafficProfile?: string;
  vlanId?: number;
  acsUrl: string;
}

export interface PppoeParams {
  pon: PonPort;
  pppoeUsername: string;
  pppoePassword: string;
}

export interface ReplaceOnuParams {
  pon: PonPort;
  onuSerial: string;
  onuType: string;
}

/** The exact ZTE C300/C320 provisioning recipe from main.py, kept verbatim. */
export function buildAuthorizeOnuCommands(p: AuthorizeOnuParams): string[] {
  const vlan = p.vlanId ?? DEFAULT_VLAN_ID;
  const traffic = p.trafficProfile ?? DEFAULT_TRAFFIC_PROFILE;
  const olt = oltInterface(p.pon);
  const onu = onuInterface(p.pon);
  return [
    "enable",
    "configure terminal",
    `interface ${olt}`,
    `onu ${p.pon.onuId} type ${p.onuType} sn ${p.onuSerial}`,
    "exit",
    `interface ${onu}`,
    `name ${p.onuName}`,
    `tcont 1 profile ${p.tcontProfile}`,
    "gemport 1 tcont 1",
    `gemport 1 traffic-limit downstream ${traffic}`,
    `service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`,
    "exit",
    `pon-onu-mng ${onu}`,
    "flow mode 1 tag-filter vlan-filter untag-filter discard",
    `flow 1 pri 0 vlan ${vlan}`,
    "gemport 1 flow 1",
    "switchport-bind switch_0/1 iphost 1",
    "switchport-bind switch_0/1 veip 1",
    "vlan-filter-mode iphost 1 tag-filter vlan-filter untag-filter discard",
    `vlan-filter iphost 1 pri 0 vlan ${vlan}`,
    "dhcp-ip ethuni eth_0/1 from-onu",
    "dhcp-ip ethuni eth_0/2 from-onu",
    "dhcp-ip ethuni eth_0/3 from-onu",
    "dhcp-ip ethuni eth_0/4 from-onu",
    "tr069-mgmt 1 state unlock",
    `tr069-mgmt 1 acs ${p.acsUrl}`,
    "security-mgmt 1 state enable mode forward protocol web https",
    "security-mgmt 998 state enable mode forward ingress-type lan protocol web https",
    "security-mgmt 999 state enable ingress-type lan protocol ftp telnet ssh snmp tr069",
  ];
}

export function buildPppoeCommands(p: PppoeParams): string[] {
  const onu = onuInterface(p.pon);
  return [
    "enable",
    "configure terminal",
    `pon-onu-mng ${onu}`,
    `pppoe 1 nat enable user ${p.pppoeUsername} password ${p.pppoePassword}`,
    "!",
    "end",
  ];
}

export function buildAuthorizeAndPppoeCommands(
  p: AuthorizeOnuParams & PppoeParams
): string[] {
  // Same as authorize, but appends the pppoe line while still inside pon-onu-mng context.
  return [
    ...buildAuthorizeOnuCommands(p),
    `pppoe 1 nat enable user ${p.pppoeUsername} password ${p.pppoePassword}`,
  ];
}

/**
 * Re-binds an existing PON port's onu-id to a new serial (customer's ONU/CPE was
 * physically swapped) without touching the rest of that onu-id's config — tcont,
 * gemport, service-port, pon-onu-mng flows, and the PPPoE credentials under
 * `interface gpon-onu_.../pon-onu-mng gpon-onu_...` are keyed by onu-id, not by
 * serial, so re-adding the same id with `no onu <id>` + `onu <id> ... sn <NEW_SN>`
 * should leave them intact — this is the standard ZTE GPON re-provisioning pattern,
 * but it has not been verified against this deployment's exact firmware; test on
 * one ONU before relying on it for live customer swaps.
 */
export function buildReplaceOnuCommands(p: ReplaceOnuParams): string[] {
  const olt = oltInterface(p.pon);
  return [
    "enable",
    "configure terminal",
    `interface ${olt}`,
    `no onu ${p.pon.onuId}`,
    `onu ${p.pon.onuId} type ${p.onuType} sn ${p.onuSerial}`,
    "exit",
  ];
}

export const TERMINAL_LENGTH_ZERO = "terminal length 0";
export const SAVE_COMMANDS = ["!", "end", "write"];

export function showGponOnuUncfg(): string {
  return "show gpon onu uncfg";
}

export function showGponOnuState(oltIface: string): string {
  return `show gpon onu state ${oltIface}`;
}

export function showGponOnuDetailInfo(onuIface: string): string {
  return `show gpon onu detail-info ${onuIface}`;
}

export function showPonPowerAttenuation(onuIface: string): string {
  return `show pon power attenuation ${onuIface}`;
}

export function showOnuRunningConfig(onuIface: string): string {
  return `show onu running config ${onuIface}`;
}
