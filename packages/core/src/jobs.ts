export const QUEUE_NAME = "oltflow-jobs";

export const JOB_NAMES = {
  oltConnectTest: "olt-connect-test",
  scanUnconfigured: "scan-unconfigured",
  refreshOnu: "refresh-onu",
  onuLive: "onu-live",
  provision: "provision",
  authorizeEponOnu: "authorize-epon-onu",
  pppoe: "pppoe",
  authorizePppoe: "authorize-pppoe",
  wifi: "wifi",
  replaceOnu: "replace-onu",
  deleteOnu: "delete-onu",
  enableWanAccess: "enable-wan-access",
  pushAcs: "push-acs",
  rebootOnu: "reboot-onu",
  rebootOnuCli: "reboot-onu-cli",
  syncInventory: "sync-inventory",
  syncDetail: "sync-detail",
  syncSignals: "sync-signals",
  snmpDiscover: "snmp-discover",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface OltConnectTestPayload {
  oltId: number;
}
export interface ScanUnconfiguredPayload {
  oltId: number;
}
export interface RefreshOnuPayload {
  oltId: number;
  onuId: number;
  ponPort: string;
}
export interface OnuLivePayload {
  oltId: number;
  onuId: number;
  ponPort: string;
}
export interface ProvisionPayload {
  oltId: number;
  onuSerial: string;
  ponPort: string;
  onuName: string;
  onuType: string;
  tcontProfile: string;
  trafficProfile: string;
  vlanId: number;
}
export interface AuthorizeEponPayload {
  oltId: number;
  ponPort: string; // epon-onu_F/S/P:N of the unauthenticated ONU (onuId is a placeholder)
  onuMac: string;
  onuType: string;
  onuName: string;
  vlanId: number;
}
export interface PppoePayload {
  oltId: number;
  ponPort: string;
  pppoeUsername: string;
  pppoePassword: string;
  vlanId: number;
}
export interface AuthorizePppoePayload extends ProvisionPayload {
  pppoeUsername: string;
  pppoePassword: string;
}
export interface WifiPayload {
  onuId: number;
  deviceId: string;
  ssid2g?: string;
  pass2g?: string;
  ssid5g?: string;
  pass5g?: string;
}
export interface ReplaceOnuPayload {
  oltId: number;
  onuId: number;
  ponPort: string;
  onuSerial: string;
  onuType: string;
}
export interface DeleteOnuPayload {
  oltId: number;
  onuId: number;
  ponPort: string;
}
export interface EnableWanAccessPayload {
  oltId: number;
  onuId: number;
  ponPort: string;
}
export interface PushAcsPayload {
  oltId: number;
  acsUrl: string;
}
export interface RebootOnuPayload {
  onuId: number;
  deviceId: string;
}
export interface RebootOnuCliPayload {
  oltId: number;
  onuId: number;
  ponPort: string;
}
export interface SyncInventoryPayload {
  oltId: number;
}
export interface SyncDetailPayload {
  oltId: number;
}
export interface SyncSignalsPayload {
  oltId: number;
}
export interface SnmpDiscoverPayload {
  oltId: number;
}

/** Redacts password-bearing strings before persisting raw device output / payloads. */
export function sanitizeOutput(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw
    .replace(/password \S+/gi, "password ***")
    .replace(/(pass(?:word)?["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1***");
}

export function sanitizePayload<T extends Record<string, unknown>>(payload: T): T {
  const clone: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(clone)) {
    if (/pass(word)?/i.test(key)) clone[key] = "***";
  }
  return clone as T;
}
