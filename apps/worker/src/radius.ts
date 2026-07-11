import mysql from "mysql2/promise";

// Read-only RADIUS Manager (DMA) access — runs in the worker (plain Node), where mysql2
// works reliably (unlike the Next/Turbopack runtime). Provides, keyed by PPPoE username
// and by MAC (Calling-Station-Id): client expiry, static IP, and the live WAN IP from the
// active session (rm_onlineradius / radacct).

export interface RadiusClient {
  expiration: Date | null;
  staticIp: string | null;
  liveIp: string | null;
  fullName: string | null;
}
export interface RadiusData {
  byUsername: Map<string, RadiusClient>;
  byMac: Map<string, { liveIp: string; username: string | null }>;
}

export function normalizeMac(s: string | null | undefined): string {
  return (s ?? "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

let pool: mysql.Pool | null = null;
function getPool(): mysql.Pool | null {
  const url = process.env.RADIUS_DB_URL ?? "";
  if (!url) return null;
  if (!pool) pool = mysql.createPool({ uri: url, connectionLimit: 4, connectTimeout: 8000, waitForConnections: true });
  return pool;
}

async function q(p: mysql.Pool, sql: string): Promise<Record<string, unknown>[]> {
  const [rows] = await p.query(sql);
  return rows as Record<string, unknown>[];
}

export interface ExpiringClient {
  username: string;
  name: string | null;
  mobile: string | null;
  phone: string | null;
  expiration: Date;
  daysLeft: number; // 3 (three-day reminder) or 0 (expires today)
}

/**
 * Active clients (enableuser=1) with a mobile on file whose account expires today or in exactly 3
 * days. NOTE: autorenew is intentionally NOT filtered — in this RADIUS Manager it defaults to 1 for
 * ~99.5% of accounts (it does not mean automatic billing), so filtering it would notify nobody.
 * Drives the WhatsApp expiry reminders. Returns null if RADIUS isn't configured/reachable.
 */
export async function getExpiringClients(): Promise<ExpiringClient[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const rows = await q(
      p,
      `SELECT username, firstname, lastname, company, mobile, phone, expiration,
              DATEDIFF(DATE(expiration), CURDATE()) AS days_left
         FROM rm_users
        WHERE enableuser = 1
          AND mobile IS NOT NULL AND mobile <> ''
          AND DATE(expiration) IN (CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY))`
    );
    return rows.map((r) => ({
      username: String(r.username ?? ""),
      name: [r.firstname, r.lastname].filter(Boolean).join(" ").trim() || String(r.company ?? "").trim() || null,
      mobile: String(r.mobile ?? "").trim() || null,
      phone: String(r.phone ?? "").trim() || null,
      expiration: new Date(r.expiration as string),
      daysLeft: Number(r.days_left),
    }));
  } catch (e) {
    console.error("[radius] getExpiringClients failed:", (e as Error)?.message);
    return null;
  }
}

/** Fetches RADIUS enrichment. Returns null if RADIUS isn't configured/reachable. */
export async function getRadiusData(): Promise<RadiusData | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const byUsername = new Map<string, RadiusClient>();
    const byMac = new Map<string, { liveIp: string; username: string | null }>();

    for (const r of await q(p, "SELECT username, expiration, staticipcpe, firstname, lastname, company FROM rm_users")) {
      const username = String(r.username ?? "");
      if (!username) continue;
      const staticIp = String(r.staticipcpe ?? "").trim();
      const name = [r.firstname, r.lastname].filter(Boolean).join(" ").trim() || String(r.company ?? "").trim();
      byUsername.set(username, {
        expiration: r.expiration ? new Date(r.expiration as string) : null,
        staticIp: staticIp && staticIp !== "0.0.0.0" ? staticIp : null,
        liveIp: null,
        fullName: name || null,
      });
    }

    for (const r of await q(p, "SELECT username, cid, cpeip FROM rm_onlineradius WHERE cpeip IS NOT NULL AND cpeip <> ''")) {
      const ip = String(r.cpeip ?? "").trim();
      if (!ip || ip === "0.0.0.0") continue;
      const username = String(r.username ?? "") || null;
      if (username && byUsername.has(username)) byUsername.get(username)!.liveIp = ip;
      const mac = normalizeMac(r.cid as string);
      if (mac) byMac.set(mac, { liveIp: ip, username });
    }
    for (const r of await q(p, "SELECT username, callingstationid, framedipaddress FROM radacct WHERE acctstoptime IS NULL AND framedipaddress IS NOT NULL AND framedipaddress <> '' ORDER BY acctstarttime DESC")) {
      const ip = String(r.framedipaddress ?? "").trim();
      if (!ip || ip === "0.0.0.0") continue;
      const username = String(r.username ?? "") || null;
      if (username && byUsername.has(username) && !byUsername.get(username)!.liveIp) byUsername.get(username)!.liveIp = ip;
      const mac = normalizeMac(r.callingstationid as string);
      if (mac && !byMac.has(mac)) byMac.set(mac, { liveIp: ip, username });
    }

    return { byUsername, byMac };
  } catch (e) {
    console.error("[radius] fetch failed:", (e as Error)?.message);
    return null;
  }
}
