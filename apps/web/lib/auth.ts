import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@oltflow/db";

const SESSION_COOKIE = "oltflow_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000; // don't update lastSeen on every API poll

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET nuk është konfiguruar");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string | null;
  role: string;
  /** Session row id (JWT jti) — present on sessions created after Phase 1. */
  sid?: string;
}

export async function createSessionCookie(
  user: SessionPayload,
  meta?: { ip?: string | null; userAgent?: string | null }
): Promise<string> {
  const sid = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      id: sid,
      userId: Number(user.sub),
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent?.slice(0, 512) ?? null,
      expiresAt,
    },
  });

  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    sid,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setJti(sid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure cookies require HTTPS. The panel is served over plain HTTP behind nginx, so
    // this is decoupled from NODE_ENV (which is "production" once we run a prod build) —
    // set COOKIE_SECURE=true only once the site is behind TLS, else login breaks over HTTP.
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return sid;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey());
      const sid = (payload.jti as string | undefined) ?? (payload.sid as string | undefined);
      if (sid) {
        await prisma.session
          .updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } })
          .catch(() => {});
      }
    } catch {
      /* token already invalid — just drop the cookie */
    }
  }
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const sid = (payload.jti as string | undefined) ?? (payload.sid as string | undefined);
    const base: SessionPayload = {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name as string | null) ?? null,
      role: payload.role as string,
      sid,
    };

    // Phase 1 sessions: require a live, non-revoked Session row. Legacy cookies without
    // jti keep working until they expire (no row to check).
    if (sid) {
      const row = await prisma.session.findUnique({ where: { id: sid } });
      if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
        return null;
      }
      // Throttled lastSeen so dashboard polling doesn't rewrite the row every 30s.
      if (Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
        prisma.session
          .update({ where: { id: sid }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      }
    }

    return base;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireRole(...roles: string[]): Promise<SessionPayload> {
  const session = await requireUser();
  if (!roles.includes(session.role)) throw new Error("FORBIDDEN");
  return session;
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

/** Revoke one session (admin or self). */
export async function revokeSession(sessionId: string, userId?: number): Promise<boolean> {
  const res = await prisma.session.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
      ...(userId !== undefined ? { userId } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return res.count > 0;
}

/** Revoke every active session for a user (force re-login / password change). */
export async function revokeAllUserSessions(userId: number, exceptId?: string): Promise<number> {
  const res = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

export function clientMetaFromRequest(request: Request): { ip: string; userAgent: string | null } {
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]!.trim() : (request.headers.get("x-real-ip") ?? "unknown");
  return { ip, userAgent: request.headers.get("user-agent") };
}

/** Optional: read request headers in Server Components (no Request object). */
export async function clientMetaFromHeaders(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]!.trim() : (h.get("x-real-ip") ?? "unknown");
  return { ip, userAgent: h.get("user-agent") };
}

export { SESSION_COOKIE, SESSION_TTL_SECONDS };
