import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { findUserByEmail, createSessionCookie } from "@/lib/auth";
import { redis } from "@/lib/redis";

// Brute-force guard: sliding 15-min window of failed attempts, tracked in Redis so it
// survives restarts and is shared across instances. Two buckets — per (IP, email) stops
// hammering one account, per IP stops sweeping many accounts from one host.
const FAIL_WINDOW_SECONDS = 15 * 60;
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 30;

function clientIp(request: Request): string {
  // Behind nginx the client is the first hop in X-Forwarded-For.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function bumpFailCounter(key: string): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, FAIL_WINDOW_SECONDS);
  return count;
}

async function auditLogin(result: "success" | "error", email: string, ip: string, userId?: number) {
  await prisma.auditLog
    .create({ data: { action: "login", result, userId: userId ?? null, payload: { email, ip } } })
    .catch(() => {}); // logging must never break the login flow itself
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email/password të pavlefshme" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const ip = clientIp(request);
  const emailKey = `oltflow:login-fail:${ip}:${email}`;
  const ipKey = `oltflow:login-fail:${ip}`;

  const [emailFails, ipFails] = await Promise.all([redis.get(emailKey), redis.get(ipKey)]).catch(() => [null, null]);
  if (Number(emailFails) >= MAX_FAILS_PER_EMAIL || Number(ipFails) >= MAX_FAILS_PER_IP) {
    return NextResponse.json(
      { error: "Shumë tentativa të dështuara — provo përsëri pas 15 minutash" },
      { status: 429 }
    );
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // Burn a bcrypt comparison anyway so response timing doesn't reveal registered emails.
    await bcrypt.compare(parsed.data.password, "$2a$10$C6UzMDM.H6dfI/f/IKcEeO7ZAr8oNzhO3M7f0DdC4/1KfSm3PZlEy");
  }
  const ok = user ? await bcrypt.compare(parsed.data.password, user.passwordH) : false;

  if (!user || !ok) {
    await Promise.all([bumpFailCounter(emailKey), bumpFailCounter(ipKey)]).catch(() => {});
    await auditLogin("error", email, ip);
    return NextResponse.json({ error: "Kredencialet janë të gabuara" }, { status: 401 });
  }

  await redis.del(emailKey).catch(() => {});
  await createSessionCookie({ sub: String(user.id), email: user.email, name: user.name, role: user.role });
  await auditLogin("success", email, ip, user.id);
  return NextResponse.json({ ok: true });
}
