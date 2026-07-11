import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { forgotPasswordSchema } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import {
  generateToken,
  hashToken,
  resolveAppBaseUrl,
  sendPasswordResetEmail,
} from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/auth-rate-limit";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit(`oltflow:forgot:${ip}`, 5);
  if (!rl.ok) {
    return NextResponse.json({ error: "Shumë tentativa — provo më vonë" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email i pavlefshëm" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  // Always return the same message (don't leak whether the email exists).
  const generic = {
    ok: true,
    message: "Nëse emaili ekziston, dërguam një lidhje rivendosjeje.",
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status === "disabled") {
    await prisma.auditLog
      .create({ data: { action: "password_reset_request", result: "error", payload: { email, ip } } })
      .catch(() => {});
    return NextResponse.json(generic);
  }

  // Invalidate previous unused reset tokens
  await prisma.verificationToken.updateMany({
    where: { userId: user.id, kind: "reset", usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = generateToken();
  await prisma.verificationToken.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      kind: "reset",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const base = await resolveAppBaseUrl(request);
  const resetUrl = `${base}/reset?token=${encodeURIComponent(raw)}`;
  const mail = await sendPasswordResetEmail(email, user.name ?? email, resetUrl);

  await prisma.auditLog
    .create({
      data: {
        userId: user.id,
        action: "password_reset_request",
        result: mail.ok ? "success" : "error",
        payload: { email, ip, mailError: mail.error ?? null },
      },
    })
    .catch(() => {});

  return NextResponse.json(generic);
}
