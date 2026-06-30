// Thin client-side fetch helpers for the browser-facing API routes.

export class ApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Gabim (${res.status})`);
  return data as T;
}

export interface OltSummary {
  id: number;
  name: string;
  ip: string;
  port: number;
  protocol: string;
  username: string;
  slots: number[];
  eponSlots: number[];
  location: string | null;
  status: string;
  lastSync: string | null;
  total: number;
  online: number;
  offline: number;
}

export const api = {
  listOlts: () => request<{ olts: OltSummary[] }>("/api/olts"),
  createOlt: (input: Record<string, unknown>) =>
    request<{ olt: { id: number; name: string; ip: string }; jobId: string }>("/api/olts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateOlt: (id: number, input: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/olts/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteOlt: (id: number) => request<{ ok: boolean }>(`/api/olts/${id}`, { method: "DELETE" }),
  stats: (oltId: number) =>
    request<{ total: number; online: number; offline: number; criticalSignal: number; warningSignal: number }>(
      `/api/olts/${oltId}/stats`
    ),
  onus: (oltId: number) => request<{ onus: OnuRow[]; total: number }>(`/api/olts/${oltId}/onus`),
  onu: (onuId: number) => request<OnuRow & { oltId: number; oltName: string }>(`/api/onus/${onuId}`),
  scanUnconfigured: (oltId: number) => request<{ jobId: string }>(`/api/olts/${oltId}/scan-unconfigured`, { method: "POST" }),
  signalHistory: (onuId: number) =>
    request<{ history: { onuRx: number | null; oltRx: number | null; signalLevel: string | null; time: string }[] }>(
      `/api/onus/${onuId}/signal-history`
    ),
  refreshOnu: (onuId: number) => request<{ jobId: string }>(`/api/onus/${onuId}/refresh`, { method: "POST" }),
  replaceOnu: (onuId: number, input: { onuSerial: string; onuType: string }) =>
    request<{ jobId: string }>(`/api/onus/${onuId}/replace`, { method: "POST", body: JSON.stringify(input) }),
  rebootOnu: (onuId: number, deviceId: string) =>
    request<{ jobId: string }>(`/api/onus/${onuId}/reboot`, { method: "POST", body: JSON.stringify({ deviceId }) }),
  wifiInfo: (onuId: number) => request<{ devices: WifiDevice[] }>(`/api/onus/${onuId}/wifi`),
  provision: (input: Record<string, unknown>) =>
    request<{ jobId: string }>("/api/provision", { method: "POST", body: JSON.stringify(input) }),
  pppoe: (input: Record<string, unknown>) =>
    request<{ jobId: string }>("/api/provision/pppoe", { method: "POST", body: JSON.stringify(input) }),
  authorizePppoe: (input: Record<string, unknown>) =>
    request<{ jobId: string }>("/api/provision/authorize-pppoe", { method: "POST", body: JSON.stringify(input) }),
  wifiUpdate: (input: Record<string, unknown>) =>
    request<{ jobId: string }>("/api/wifi/update", { method: "POST", body: JSON.stringify(input) }),
  job: (id: string) =>
    request<{ id: string; type: string; status: string; error: string | null; output: unknown }>(`/api/jobs/${id}`),
  audit: (oltId?: number) => request<{ logs: AuditEntry[] }>(`/api/audit${oltId ? `?oltId=${oltId}` : ""}`),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
};

export interface OnuRow {
  id: number;
  ponPort: string;
  serial: string | null;
  name: string | null;
  type: string | null;
  state: string | null;
  distance: string | null;
  onlineDuration: string | null;
  vlan: string | null;
  pppoeUser: string | null;
  lineProfile: string | null;
  serviceProfile: string | null;
  lastSeen: string | null;
  wanIp: string | null;
  onuRx: number | null;
  onuTx: number | null;
  oltRx: number | null;
  oltTx: number | null;
  attenUp: number | null;
  attenDown: number | null;
  signalLevel: string | null;
}

export interface WlanBand {
  ssid: string;
  password: string;
  enabled: boolean;
  wlanIdx: string;
  standard: string;
}

export interface WifiDevice {
  deviceId: string;
  wlan2g?: WlanBand;
  wlan5g?: WlanBand;
}

export interface UncfgOnu {
  ponPort: string;
  serial: string;
  state: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  oltId: number | null;
  ponPort: string | null;
  result: string | null;
  createdAt: string;
}

/** Poll GET /api/jobs/:id until status is done|failed. Default timeout is generous —
 * a real ZTE OLT's authorize+PPPoE command sequence (~15-20 commands plus a final
 * `write` that saves to flash) has been observed taking 50+ seconds on real hardware;
 * timing the client out early doesn't stop the job, it just shows a false failure
 * while the device keeps applying the config in the background. */
export async function pollJob(jobId: string, { intervalMs = 1500, timeoutMs = 90000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await api.job(jobId);
    if (job.status === "done" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new ApiError("Job mori shumë kohë (timeout)");
}
