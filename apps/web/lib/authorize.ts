import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import {
  hasPermission,
  effectivePermissions,
  type PermissionId,
  type PermissionOverride,
} from "@oltflow/core";
import { getSession, type SessionPayload } from "./auth";
import { allowedOltIds } from "./olt-access";

/**
 * Server-side permission check. Loads per-user overrides once and evaluates against
 * the role default bundle. Also enforces OLT scoping when `oltId` is provided.
 *
 * Returns null on success, or a NextResponse (401/403) on failure — same pattern as
 * guardOltAccess so routes can `const denied = await requirePerm(...); if (denied) return denied`.
 */

const overrideCache = new Map<number, { expires: number; overrides: PermissionOverride[] }>();
const OVERRIDE_TTL_MS = 15_000;

async function loadOverrides(userId: number): Promise<PermissionOverride[]> {
  const now = Date.now();
  const hit = overrideCache.get(userId);
  if (hit && hit.expires > now) return hit.overrides;
  const rows = await prisma.userPermission.findMany({
    where: { userId },
    select: { perm: true, allow: true },
  });
  const overrides = rows.map((r) => ({ perm: r.perm, allow: r.allow }));
  overrideCache.set(userId, { expires: now + OVERRIDE_TTL_MS, overrides });
  // Bound the map
  if (overrideCache.size > 500) {
    for (const [k, v] of overrideCache) if (v.expires <= now) overrideCache.delete(k);
  }
  return overrides;
}

/** Invalidate cached overrides after admin edits a user's permission set. */
export function invalidatePermissionCache(userId?: number): void {
  if (userId === undefined) overrideCache.clear();
  else overrideCache.delete(userId);
}

export async function userCan(
  session: SessionPayload,
  permission: PermissionId | string
): Promise<boolean> {
  const overrides = await loadOverrides(Number(session.sub));
  return hasPermission(session.role, permission, overrides);
}

export async function getEffectivePerms(session: SessionPayload): Promise<Set<string>> {
  const overrides = await loadOverrides(Number(session.sub));
  return effectivePermissions(session.role, overrides);
}

/**
 * Require authentication + permission. Optionally require access to a specific OLT.
 */
export async function requirePerm(
  permission: PermissionId | string,
  opts?: { oltId?: number }
): Promise<{ session: SessionPayload } | { error: NextResponse; session?: undefined }> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };

  const ok = await userCan(session, permission);
  if (!ok) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };

  if (opts?.oltId !== undefined) {
    const allowed = await allowedOltIds(session);
    if (allowed !== "all" && !allowed.includes(opts.oltId)) {
      return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
    }
  }

  return { session };
}

/** Require admin.access (or legacy admin role) for the whole /admin section. */
export async function requireAdminAccess(): Promise<
  { session: SessionPayload } | { error: NextResponse; session?: undefined }
> {
  return requirePerm("admin.access");
}
