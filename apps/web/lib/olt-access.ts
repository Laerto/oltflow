import { NextResponse } from "next/server";
import { roleRank, TIER, type Tier } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { getSession, type SessionPayload } from "./auth";

/**
 * Guard for mutating routes: 401 if unauthenticated, 403 if the session's role is below
 * `tier`, else null (allow). Defense-in-depth — proxy.ts already gates by (method, path),
 * but every destructive handler re-asserts its tier so authorization never rests on the
 * middleware alone (a matcher gap or a middleware-bypass bug can't grant a viewer write access).
 */
export async function guardTier(tier: Tier): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (roleRank(session.role) < tier) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return null;
}

/**
 * OLT ids a session may see/operate. Admins are never scoped, and a non-admin with NO
 * explicit assignment is also unrestricted (backward compatible — assigning specific OLTs
 * is what turns scoping on). Returns "all" for the unrestricted case, else the id list.
 */
export async function allowedOltIds(session: SessionPayload): Promise<number[] | "all"> {
  if (roleRank(session.role) >= TIER.ADMIN) return "all";
  const user = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: { olts: { select: { id: true } } },
  });
  const ids = user?.olts.map((o) => o.id) ?? [];
  return ids.length ? ids : "all";
}

/** Guard for `/api/olts/[id]/*`: 401 if unauthenticated, 403 if the OLT is outside the
 * user's scope, else `null` (allow). */
export async function guardOltAccess(oltId: number): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const allowed = await allowedOltIds(session);
  if (allowed !== "all" && !allowed.includes(oltId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

/** Guard for `/api/onus/[id]/*`: resolves the ONU's parent OLT and applies the same scope
 * check, so a scoped user can't reach an out-of-zone ONU by id. */
export async function guardOnuAccess(onuId: number): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const allowed = await allowedOltIds(session);
  if (allowed === "all") return null;
  const onu = await prisma.onu.findUnique({ where: { id: onuId }, select: { oltId: true } });
  if (!onu) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!allowed.includes(onu.oltId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return null;
}
