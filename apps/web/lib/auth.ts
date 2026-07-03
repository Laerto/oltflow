import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@oltflow/db";

const SESSION_COOKIE = "oltflow_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
}

export async function createSessionCookie(user: SessionPayload): Promise<void> {
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
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
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name as string | null) ?? null,
      role: payload.role as string,
    };
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

export { SESSION_COOKIE };
