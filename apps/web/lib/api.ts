// Thin client-side fetch helpers for the browser-facing API routes.

export class ApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  // Session expired / not logged in — bounce to login (middleware also guards navigations).
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError("Sesioni skadoi — hyr përsëri");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) throw new ApiError(data.error === "FORBIDDEN" ? "Nuk keni leje për këtë veprim" : data.error ?? "E ndaluar");
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
  snmpCommunity: string | null;
  latitude: number | null;
  longitude: number | null;
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
  oltPorts: (oltId: number) => request<{ name: string; cards: OltCard[] }>(`/api/olts/${oltId}/ports`),
  oltShelf: (oltId: number) => request<{ name: string; at: string | null; cards: ShelfCard[] }>(`/api/olts/${oltId}/shelf`),
  resyncOlt: (oltId: number) => request<{ jobId: string }>(`/api/olts/${oltId}/resync`, { method: "POST" }),
  stats: (oltId: number) =>
    request<{
      total: number;
      online: number;
      offline: number;
      pwrFail: number;
      los: number;
      naOffline: number;
      criticalSignal: number;
      warningSignal: number;
      expiring: { id: number; name: string | null; ponPort: string; expiration: string | null; pppoeUser: string | null }[];
    }>(`/api/olts/${oltId}/stats`),
  onus: (oltId: number, params?: OnuListParams) =>
    request<OnuListResponse>(`/api/olts/${oltId}/onus${onuListQuery(params)}`),
  allOnus: (params?: OnuListParams) => request<OnuListResponse>(`/api/onus${onuListQuery(params)}`),
  ponTraffic: (oltId: number) =>
    request<{
      available: boolean;
      ports: { ponPort: string; downBps: number; upBps: number }[];
      series: { t: number; downBps: number; upBps: number }[];
    }>(`/api/olts/${oltId}/pon-traffic`),
  oltHealth: (oltId: number) =>
    request<{
      available: boolean;
      cards: { slot: number; card: string; cpu: number; temp: number }[];
      series: { t: number; cpu: number; temp: number }[];
      maxCpu?: number;
      maxTemp?: number;
      avgCpu?: number;
    }>(`/api/olts/${oltId}/health`),
  onu: (onuId: number) => request<OnuRow & { oltId: number; oltName: string }>(`/api/onus/${onuId}`),
  unconfigured: (oltId: number) => request<{ onus: UncfgOnu[]; total: number }>(`/api/olts/${oltId}/unconfigured`),
  scanUnconfigured: (oltId: number) => request<{ jobId: string }>(`/api/olts/${oltId}/scan-unconfigured`, { method: "POST" }),
  pushAcs: (oltId: number) => request<{ jobId: string; acsUrl: string }>(`/api/olts/${oltId}/push-acs`, { method: "POST" }),
  signalHistory: (onuId: number) =>
    request<{ history: { onuRx: number | null; oltRx: number | null; signalLevel: string | null; time: string }[] }>(
      `/api/onus/${onuId}/signal-history`
    ),
  refreshOnu: (onuId: number) => request<{ jobId: string }>(`/api/onus/${onuId}/refresh`, { method: "POST" }),
  renameOnu: (onuId: number, name: string) =>
    request<{ jobId: string }>(`/api/onus/${onuId}/rename`, { method: "POST", body: JSON.stringify({ name }) }),
  pushAcsToOnu: (onuId: number) =>
    request<{ jobId: string; acsUrl: string }>(`/api/onus/${onuId}/push-acs`, { method: "POST" }),
  onuLive: (onuId: number) => request<{ jobId: string }>(`/api/onus/${onuId}/live`, { method: "POST" }),
  replaceOnu: (onuId: number, input: { onuSerial: string; onuType: string }) =>
    request<{ jobId: string }>(`/api/onus/${onuId}/replace`, { method: "POST", body: JSON.stringify(input) }),
  deleteOnu: (onuId: number) => request<{ jobId: string }>(`/api/onus/${onuId}`, { method: "DELETE" }),
  setOnuMgmtIp: (onuId: number, mgmtIp: string) =>
    request<{ ok: boolean; mgmtIp: string | null }>(`/api/onus/${onuId}`, { method: "PATCH", body: JSON.stringify({ mgmtIp }) }),
  enableWanAccess: (onuId: number) => request<{ jobId: string }>(`/api/onus/${onuId}/wan-access`, { method: "POST" }),
  restartOnu: (onuId: number) => request<{ jobId: string }>(`/api/onus/${onuId}/restart`, { method: "POST" }),
  rebootOnu: (onuId: number, deviceId: string) =>
    request<{ jobId: string }>(`/api/onus/${onuId}/reboot`, { method: "POST", body: JSON.stringify({ deviceId }) }),
  wifiInfo: (onuId: number) => request<{ devices: WifiDevice[] }>(`/api/onus/${onuId}/wifi`),
  provision: (input: Record<string, unknown>) =>
    request<{ jobId: string }>("/api/provision", { method: "POST", body: JSON.stringify(input) }),
  authorizeEpon: (input: Record<string, unknown>) =>
    request<{ jobId: string }>("/api/provision/epon", { method: "POST", body: JSON.stringify(input) }),
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
  me: () => request<Me>("/api/me"),
  listUsers: () => request<{ users: UserRow[] }>("/api/users"),
  createUser: (input: { email: string; name?: string; password: string; role: string; oltIds?: number[]; telegramChatId?: string }) =>
    request<{ user: UserRow }>("/api/users", { method: "POST", body: JSON.stringify(input) }),
  inviteUser: (input: { email: string; name?: string }) =>
    request<{ ok: boolean; inviteUrl?: string; warning?: string }>("/api/admin/invite", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateUser: (id: number, input: { name?: string; role?: string; password?: string; oltIds?: number[]; telegramChatId?: string; status?: string }) =>
    request<{ user: UserRow }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  listTechnicians: () => request<{ technicians: { id: number; name: string | null; email: string }[] }>("/api/technicians"),
  mapData: () => request<{ olts: MapOlt[]; onus: MapOnu[]; splitters: MapSplitter[]; fiber: MapFiber[] }>("/api/map"),
  setOnuLocation: (id: number, latitude: number | null, longitude: number | null) =>
    request<{ ok: boolean }>(`/api/onus/${id}`, { method: "PATCH", body: JSON.stringify({ latitude, longitude }) }),
  createSplitter: (input: Record<string, unknown>) =>
    request<{ splitter: { id: number } }>("/api/splitters", { method: "POST", body: JSON.stringify(input) }),
  updateSplitter: (id: number, input: Record<string, unknown>) =>
    request<{ splitter: { id: number } }>(`/api/splitters/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteSplitter: (id: number) => request<{ ok: boolean }>(`/api/splitters/${id}`, { method: "DELETE" }),
  createFiber: (input: Record<string, unknown>) =>
    request<{ fiber: { id: number } }>("/api/fiber", { method: "POST", body: JSON.stringify(input) }),
  deleteFiber: (id: number) => request<{ ok: boolean }>(`/api/fiber/${id}`, { method: "DELETE" }),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" }),
  // ── Tickets (fault repair) ──
  listTickets: (status?: string) => request<{ tickets: TicketRow[] }>(`/api/tickets${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  getTicket: (id: number) => request<{ ticket: TicketRow }>(`/api/tickets/${id}`),
  createTicket: (input: { onuId: number; category: string; title: string; description?: string; assignedToId?: number }) =>
    request<{ ticket: TicketRow }>("/api/tickets", { method: "POST", body: JSON.stringify(input) }),
  assignTicket: (id: number, assignedToId: number | null) =>
    request<{ ticket: TicketRow }>(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ assignedToId }) }),
  ticketAction: (id: number, action: string, resolutionNote?: string) =>
    request<{ ticket: TicketRow }>(`/api/tickets/${id}/action`, { method: "POST", body: JSON.stringify({ action, resolutionNote }) }),
  ping: (ip: string) =>
    request<{ alive: boolean; avgMs: number | null; loss: number }>(`/api/ping?ip=${encodeURIComponent(ip)}`),
  alarms: () => request<AlarmsResponse>("/api/alarms"),

  // ── Admin console (Phase 2) ──
  adminOverview: () => request<AdminOverview>("/api/admin/overview"),
  adminPermissions: () =>
    request<{
      catalogue: { id: string; label: string; description?: string | null; group: string }[];
      groups: { id: string; label: string }[];
      roleDefaults: Record<string, string[]>;
      roleMatrix: Record<string, Record<string, boolean>>;
      users: { id: number; email: string; name: string | null; role: string; overrides: { perm: string; allow: boolean }[] }[];
    }>("/api/admin/permissions"),
  adminSetPermission: (input: { userId: number; perm: string; allow: boolean | null }) =>
    request<{ ok: boolean }>("/api/admin/permissions", { method: "PUT", body: JSON.stringify(input) }),
  adminAudit: (params?: {
    q?: string;
    action?: string;
    result?: string;
    oltId?: number;
    limit?: number;
    cursor?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.action) sp.set("action", params.action);
    if (params?.result) sp.set("result", params.result);
    if (params?.oltId != null) sp.set("oltId", String(params.oltId));
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.cursor) sp.set("cursor", params.cursor);
    const q = sp.toString();
    return request<{ logs: AdminAuditRow[]; nextCursor: string | null }>(
      `/api/admin/audit${q ? `?${q}` : ""}`
    );
  },
  adminJobs: (params?: { status?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.limit != null) sp.set("limit", String(params.limit));
    const q = sp.toString();
    return request<{
      jobs: AdminJobRow[];
      byStatus: Record<string, number>;
      queue: { waiting: number; active: number; delayed: number; failed: number };
    }>(`/api/admin/jobs${q ? `?${q}` : ""}`);
  },
  adminJobAction: (id: string, action: "retry" | "discard") =>
    request<{ ok: boolean }>(`/api/admin/jobs/${id}`, { method: "POST", body: JSON.stringify({ action }) }),
  adminSettings: () =>
    request<{
      settings: { key: string; label: string; group: string; type: "number" | "string" | "boolean"; value: unknown; updatedAt: string | null }[];
    }>("/api/admin/settings"),
  adminSetSetting: (key: string, value: unknown) =>
    request<{ ok: boolean }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ key, value }) }),
  adminSessions: () =>
    request<{
      sessions: {
        id: string;
        userId: number;
        email: string;
        name: string | null;
        role: string;
        ip: string | null;
        userAgent: string | null;
        createdAt: string;
        lastSeenAt: string;
        expiresAt: string;
        revoked: boolean;
      }[];
    }>("/api/admin/sessions"),
  adminRevokeSession: (sessionId: string) =>
    request<{ ok: boolean }>("/api/admin/sessions", { method: "DELETE", body: JSON.stringify({ sessionId }) }),
  adminRevokeUserSessions: (userId: number) =>
    request<{ ok: boolean }>("/api/admin/sessions", { method: "DELETE", body: JSON.stringify({ userId, all: true }) }),
  adminLogs: (params?: { level?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.level) sp.set("level", params.level);
    if (params?.limit != null) sp.set("limit", String(params.limit));
    const q = sp.toString();
    return request<{ logs: Record<string, unknown>[]; total: number }>(`/api/admin/logs${q ? `?${q}` : ""}`);
  },

  // ── Phase 3: Integrations + notifications ──
  adminIntegrations: () =>
    request<{
      integrations: {
        id: string;
        label: string;
        description: string;
        group: string;
        enabled: boolean;
        status: string | null;
        statusDetail: string | null;
        fromEnvFallback: boolean;
      }[];
    }>("/api/admin/integrations"),
  adminIntegration: (id: string) =>
    request<{
      id: string;
      enabled: boolean;
      config: Record<string, unknown>;
      status: string | null;
      statusDetail: string | null;
    }>(`/api/admin/integrations/${id}`),
  adminSaveIntegration: (id: string, input: { enabled: boolean; config: Record<string, unknown> }) =>
    request<{ ok: boolean }>(`/api/admin/integrations/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  adminTestIntegration: (id: string, opts?: { sendTest?: boolean; to?: string }) =>
    request<{ ok: boolean; detail: string }>(`/api/admin/integrations/${id}`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
  waStatus: () =>
    request<{ status: string; number: string | null; error: string | null; qr: string | null }>(
      "/api/admin/integrations/whatsapp"
    ),
  waControl: (action: "link" | "unlink") =>
    request<{ ok: boolean; workerListening: boolean }>("/api/admin/integrations/whatsapp", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  telegramChats: () =>
    request<{ chats: { id: string; title: string; type: string }[]; detail?: string }>(
      "/api/admin/integrations/telegram/chats"
    ),
  adminNotifyRules: () =>
    request<{
      rules: Record<string, unknown>[];
      meta: { eventTypes: string[]; channels: string[]; behaviors: string[] };
    }>("/api/admin/notifications/rules"),
  adminCreateNotifyRule: (input: Record<string, unknown>) =>
    request<{ rule: unknown }>("/api/admin/notifications/rules", { method: "POST", body: JSON.stringify(input) }),
  adminUpdateNotifyRule: (id: number, input: Record<string, unknown>) =>
    request<{ rule: unknown }>(`/api/admin/notifications/rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  adminDeleteNotifyRule: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/notifications/rules/${id}`, { method: "DELETE" }),
  adminNotifyLogs: (params?: { status?: string; channel?: string }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.channel) sp.set("channel", params.channel);
    const q = sp.toString();
    return request<{ logs: { id: string; eventType: string; channel: string; status: string; error: string | null; target: string | null; alarmKey: string | null; createdAt: string }[] }>(
      `/api/admin/notifications/logs${q ? `?${q}` : ""}`
    );
  },
  adminMaintenance: () =>
    request<{
      windows: {
        id: number;
        name: string;
        oltId: number | null;
        oltName: string | null;
        startsAt: string;
        endsAt: string;
        reason: string | null;
        active: boolean;
      }[];
    }>("/api/admin/maintenance"),
  adminCreateMaintenance: (input: { name: string; startsAt: string; endsAt: string; reason?: string; oltId?: number }) =>
    request<{ window: unknown }>("/api/admin/maintenance", { method: "POST", body: JSON.stringify(input) }),
  adminDeleteMaintenance: (id: number) =>
    request<{ ok: boolean }>("/api/admin/maintenance", { method: "DELETE", body: JSON.stringify({ id }) }),
  alarmAction: (key: string, action: "ack" | "unack" | "silence", minutes?: number) =>
    request<{ ok: boolean }>(`/api/alarms/${encodeURIComponent(key)}`, {
      method: "POST",
      body: JSON.stringify({ action, minutes }),
    }),

  // ── Phase 5: Backup ──
  adminBackupTargets: () => request<{ targets: Record<string, unknown>[] }>("/api/admin/backup/targets"),
  adminCreateBackupTarget: (input: {
    kind: string;
    name: string;
    config: Record<string, unknown>;
    schedule?: string | null;
    retention?: { keepLast?: number };
    enabled?: boolean;
  }) => request<{ target: { id: number } }>("/api/admin/backup/targets", { method: "POST", body: JSON.stringify(input) }),
  adminDeleteBackupTarget: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/backup/targets/${id}`, { method: "DELETE" }),
  adminBackupRuns: () => request<{ runs: Record<string, unknown>[] }>("/api/admin/backup/runs"),
  adminStartBackup: (targetId?: number) =>
    request<{ runId: number; jobId: string }>("/api/admin/backup/runs", {
      method: "POST",
      body: JSON.stringify({ targetId }),
    }),
  adminBackupRun: (id: number) =>
    request<{ run: Record<string, unknown>; restoreCommand: string }>(`/api/admin/backup/runs/${id}`),
  adminVerifyBackup: (id: number) =>
    request<{ ok: boolean; jobId: string }>(`/api/admin/backup/runs/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: "verify" }),
    }),

  // ── Phase 6: GenieACS CPE ──
  onuAcs: (onuId: number) =>
    request<{ acs: import("@/components/onu-cpe-panel").AcsMirror | null }>(`/api/onus/${onuId}/acs`),
  onuAcsRefresh: (onuId: number) =>
    request<{ jobId: string }>(`/api/onus/${onuId}/acs`, { method: "POST" }),
  onuAcsFactoryReset: (onuId: number, deviceId: string) =>
    request<{ jobId: string }>(`/api/onus/${onuId}/acs/factory-reset`, {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    }),
  cpeList: (params?: {
    q?: string;
    neverInformed?: boolean;
    firmware?: string;
    limit?: number;
    offset?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.neverInformed) sp.set("neverInformed", "1");
    if (params?.firmware) sp.set("firmware", params.firmware);
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.offset) sp.set("offset", String(params.offset));
    const q = sp.toString();
    return request<{ total: number; nextOffset: number | null; devices: Record<string, unknown>[] }>(
      `/api/cpe${q ? `?${q}` : ""}`
    );
  },
  cpeStats: () =>
    request<{
      total: number;
      neverInformed: number;
      pendingProvision: number;
      firmware: { version: string; count: number }[];
    }>("/api/cpe/stats"),
};

export interface AdminOverview {
  health: { db: boolean; redis: boolean; worker: boolean; workerLastBeat: string | null };
  counts: {
    olts: number;
    onus: number;
    users: number;
    openAlarms: number;
    openTickets: number;
    activeSessions: number;
    failedJobs24h: number;
  };
  queue: { waiting: number; active: number; delayed: number; failed: number };
  syncLagSec: number | null;
  olts: { id: number; name: string; status: string; lastSync: string | null; lagSec: number | null }[];
  recentJobs: { id: string; type: string; status: string; error: string | null; createdAt: string; oltId: number | null }[];
}
export interface AdminAuditRow {
  id: string;
  action: string;
  result: string | null;
  oltName: string | null;
  ponPort: string | null;
  userEmail: string | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
}
export interface AdminJobRow {
  id: string;
  type: string;
  status: string;
  oltName: string | null;
  ponPort: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AlarmSeverity = "critical" | "warning";
export interface AlarmItem {
  id: string;
  severity: AlarmSeverity;
  kind: "olt_offline" | "port_outage" | "onu_signal" | "onu_offline" | "onu_expiry";
  title: string;
  detail: string;
  href?: string;
  acked?: boolean;
}
export interface AlarmsResponse {
  items: AlarmItem[];
  counts: { critical: number; warning: number };
}

export interface OnuListParams {
  q?: string;
  status?: "all" | "online" | "offline";
  signal?: "all" | "good" | "warning" | "critical";
  cursor?: number | null;
  limit?: number;
}
export interface OnuListResponse {
  onus: OnuRow[];
  total: number;
  nextCursor: number | null;
  limit: number;
}

function onuListQuery(params?: OnuListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.signal && params.signal !== "all") sp.set("signal", params.signal);
  if (params.cursor != null) sp.set("cursor", String(params.cursor));
  if (params.limit != null) sp.set("limit", String(params.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface Me {
  id: number;
  email: string;
  name: string | null;
  role: string;
}
export interface UserRow {
  id: number;
  email: string;
  name: string | null;
  role: string;
  status?: string;
  emailVerifiedAt?: string | null;
  createdAt: string;
  telegramChatId: string | null;
  olts: { id: number; name: string }[];
}

interface TicketPerson {
  id: number;
  name: string | null;
  email: string;
}
export interface TicketRow {
  id: number;
  oltId: number;
  category: string;
  severity: string | null;
  title: string;
  description: string | null;
  status: string;
  resolutionNote: string | null;
  rxAtOpen: number | null;
  oltRxAtOpen: number | null;
  rxAtVerify: number | null;
  openedAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  assignedToId: number | null;
  onu: { id: number; name: string | null; ponPort: string; serial: string | null };
  olt: { id: number; name: string };
  openedBy: TicketPerson | null;
  assignedTo: TicketPerson | null;
}

export interface MapOlt {
  id: number;
  name: string;
  lat: number;
  lng: number;
  status: string;
  location: string | null;
}
export interface MapOnu {
  id: number;
  name: string | null;
  ponPort: string;
  oltId: number;
  lat: number;
  lng: number;
  state: string | null;
  splitterId: number | null;
  onuRx: number | null;
  band: string; // good | warning | critical | offline | unknown
}
export interface MapSplitter {
  id: number;
  name: string;
  ratio: string;
  lat: number;
  lng: number;
  oltId: number | null;
  ponPort: string | null;
  parentSplitterId: number | null;
  note: string | null;
  used: number; // ONUs attached
}
export interface MapFiber {
  id: number;
  name: string | null;
  kind: string; // backbone | distribution | drop
  path: [number, number][];
  oltId: number | null;
  cores: number | null;
  lengthM: number | null;
}

export interface OltPort {
  port: number;
  total: number;
  online: number;
}
export interface OltCard {
  slot: number;
  kind: "gpon" | "epon";
  card: string;
  ports: OltPort[];
}

export type CardRole = "power" | "control" | "gpon" | "epon" | "uplink-xge" | "uplink-ge" | "other";
export interface UplinkPort {
  port: number;
  name: string;
  present: boolean;
  up: boolean | null;
  moduleType?: string;
  vendor?: string;
  rxPower: number | null;
  txPower: number | null;
  temp: number | null;
  vol: number | null;
  bias: number | null;
  rxLower: number | null;
  rxUpper: number | null;
  txLower: number | null;
  txUpper: number | null;
}
export interface ShelfCard {
  slot: number;
  cfgType: string;
  realType: string;
  role: CardRole;
  status: string;
  ports: number | null;
  onus?: { total: number; online: number };
  portOnus?: { port: number; total: number; online: number }[];
  uplinks?: UplinkPort[];
}

export interface OnuRow {
  id: number;
  oltId?: number;
  oltName?: string; // set only in the all-OLTs view, for the OLT column
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
  mac: string | null;
  mgmtIp: string | null;
  winboxUrl?: string | null;
  expiration: string | null;
  customer: string | null;
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

export interface OnuMacEntry {
  mac: string;
  vlan: string | null;
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
  busy?: boolean;
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
