/**
 * Granular permission catalogue + role default bundles.
 * Server enforcement: `authorize()` in the web app loads per-user overrides from DB
 * and calls `effectivePermissions(role, overrides)`. UI uses the browser-safe mirror
 * in apps/web/lib/permissions.ts for hide/show only.
 */

export const PERMISSIONS = [
  { id: "onu.view", label: "Shiko ONU", description: "Lexim i inventarit dhe detajeve të ONU", group: "onu" },
  { id: "onu.reboot", label: "Riniso ONU", description: "Restart / reboot i ONU", group: "onu" },
  { id: "onu.provision", label: "Provizionim ONU", description: "Autorizim / EPON / authorize+PPPoE", group: "onu" },
  { id: "onu.delete", label: "Fshi ONU", description: "Fshirje e ONU nga OLT", group: "onu" },
  { id: "onu.wifi", label: "WiFi (TR-069)", description: "Ndryshim WiFi përmes GenieACS", group: "onu" },
  { id: "onu.pppoe", label: "PPPoE", description: "Konfigurim kredencialesh PPPoE", group: "onu" },
  { id: "olt.manage", label: "Menaxho OLT", description: "Shto/edito OLT, push-ACS, SNMP discover", group: "olt" },
  { id: "olt.delete", label: "Fshi OLT", description: "Fshirje e OLT nga paneli", group: "olt" },
  { id: "tickets.work", label: "Punë me defekte", description: "Merr / zgjidh ticket-e (teknik)", group: "tickets" },
  { id: "tickets.manage", label: "Menaxho defektet", description: "Hap / cakto ticket-e (zyra)", group: "tickets" },
  { id: "map.edit", label: "Edito hartën", description: "Splitter / fiber në hartë", group: "map" },
  { id: "users.manage", label: "Menaxho përdoruesit", description: "CRUD përdoruesish dhe scope OLT", group: "admin" },
  { id: "permissions.manage", label: "Menaxho lejet", description: "Matrica e lejeve dhe overrides", group: "admin" },
  { id: "integrations.manage", label: "Integrime", description: "Telegram / ACS / RADIUS config", group: "admin" },
  { id: "backup.run", label: "Backup", description: "Nis dhe shiko backup-e", group: "admin" },
  { id: "audit.view", label: "Audit log", description: "Shiko dhe eksporton auditin", group: "admin" },
  { id: "settings.manage", label: "Cilësimet", description: "Thresholds, intervale, retention", group: "admin" },
  { id: "jobs.view", label: "Jobs", description: "Shiko radhën e punëve BullMQ", group: "admin" },
  { id: "jobs.manage", label: "Menaxho jobs", description: "Retry / discard jobs", group: "admin" },
  { id: "sessions.manage", label: "Sesionet", description: "Listo dhe revoko sesione", group: "admin" },
  { id: "admin.access", label: "Akses admin", description: "Hyrje në seksionin /admin", group: "admin" },
] as const;

export type PermissionId = (typeof PERMISSIONS)[number]["id"];

export const PERMISSION_IDS: PermissionId[] = PERMISSIONS.map((p) => p.id);

export const PERMISSION_GROUPS: { id: string; label: string }[] = [
  { id: "onu", label: "ONU" },
  { id: "olt", label: "OLT" },
  { id: "tickets", label: "Defektet" },
  { id: "map", label: "Harta" },
  { id: "admin", label: "Administrim" },
];

/** Default permission set for each role. Admin is implicit "all". */
const SUPPORT_PERMS: PermissionId[] = [
  "onu.view",
  "onu.reboot",
  "onu.provision",
  "onu.wifi",
  "onu.pppoe",
  "olt.manage",
  "tickets.work",
  "tickets.manage",
  "map.edit",
];

const TECHNICIAN_PERMS: PermissionId[] = ["onu.view", "tickets.work"];

const VIEWER_PERMS: PermissionId[] = ["onu.view"];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionId[]> = {
  admin: [...PERMISSION_IDS], // explicit list for the matrix UI
  support: SUPPORT_PERMS,
  operator: SUPPORT_PERMS, // legacy alias
  technician: TECHNICIAN_PERMS,
  viewer: VIEWER_PERMS,
};

export interface PermissionOverride {
  perm: string;
  allow: boolean;
}

/**
 * Resolve effective permission set for a role + optional per-user overrides.
 * Overrides: allow=true adds, allow=false removes. Admin role always gets everything
 * unless an explicit deny is set (rare; still honoured so a locked-down admin works).
 */
export function effectivePermissions(
  role: string | null | undefined,
  overrides: PermissionOverride[] = []
): Set<string> {
  const base = new Set<string>(ROLE_DEFAULT_PERMISSIONS[role ?? "viewer"] ?? VIEWER_PERMS);
  // Admin defaults to all catalogue ids even if ROLE_DEFAULT drifts.
  if (role === "admin") {
    for (const id of PERMISSION_IDS) base.add(id);
  }
  for (const o of overrides) {
    if (o.allow) base.add(o.perm);
    else base.delete(o.perm);
  }
  return base;
}

export function hasPermission(
  role: string | null | undefined,
  permission: PermissionId | string,
  overrides: PermissionOverride[] = []
): boolean {
  return effectivePermissions(role, overrides).has(permission);
}

/** Role-default matrix for the admin permissions page (no overrides). */
export function rolePermissionMatrix(): Record<string, Record<string, boolean>> {
  const roles = ["admin", "support", "technician", "viewer"] as const;
  const out: Record<string, Record<string, boolean>> = {};
  for (const role of roles) {
    const set = effectivePermissions(role, []);
    out[role] = {};
    for (const id of PERMISSION_IDS) out[role][id] = set.has(id);
  }
  return out;
}
