import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { signupSchema } from "@oltflow/core";
import {
  prisma,
  getIntegrationSecrets,
  type TelegramConfig,
} from "@oltflow/db";
import {
  generateToken,
  hashToken,
  isPublicSignupEnabled,
  resolveAppBaseUrl,
  sendVerifyEmail,
} from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/auth-rate-limit";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit(`oltflow:signup:${ip}`, 5);
  if (!rl.ok) {
    return NextResponse.json({ error: "Shumë tentativa — provo më vonë" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Të dhëna të pavlefshme (password min 8 karaktere)" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const publicOn = await isPublicSignupEnabled();
  const inviteRaw = parsed.data.inviteToken;

  // Invite token bypasses public-signup toggle and completes a pre-created invite user.
  if (inviteRaw) {
    const inviteHash = hashToken(inviteRaw);
    const inv = await prisma.verificationToken.findFirst({
      where: { tokenHash: inviteHash, kind: "invite", usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!inv) return NextResponse.json({ error: "Ftesa është e pavlefshme ose e skaduar" }, { status: 400 });
    if (inv.user.email.toLowerCase() !== email) {
      return NextResponse.json({ error: "Email nuk përputhet me ftesën" }, { status: 400 });
    }

    const passwordH = await bcrypt.hash(parsed.data.password, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: inv.userId },
        data: {
          name: parsed.data.name,
          passwordH,
          status: "active",
          emailVerifiedAt: new Date(),
          role: inv.user.role || "viewer",
        },
      }),
      prisma.verificationToken.update({ where: { id: inv.id }, data: { usedAt: new Date() } }),
    ]);

    await prisma.auditLog
      .create({
        data: {
          userId: inv.userId,
          action: "signup_invite",
          result: "success",
          payload: { email, ip },
        },
      })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      needsVerification: false,
      message: "Llogaria u krijua — tani mund të hyni.",
    });
  }

  if (!publicOn) {
    return NextResponse.json({ error: "Regjistrimi publik është i mbyllur — kërko ftesë nga admini" }, { status: 403 });
  }

  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "Ky email ekziston tashmë" }, { status: 409 });
  }

  const passwordH = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordH,
      role: "viewer",
      status: "pending",
      emailVerifiedAt: null,
    },
  });

  const raw = generateToken();
  await prisma.verificationToken.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      kind: "verify",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const base = await resolveAppBaseUrl(request);
  const verifyUrl = `${base}/verify?token=${encodeURIComponent(raw)}`;
  const mail = await sendVerifyEmail(email, parsed.data.name, verifyUrl);

  await prisma.auditLog
    .create({
      data: {
        userId: user.id,
        action: "signup",
        result: mail.ok ? "success" : "error",
        payload: { email, ip, mailError: mail.error ?? null },
      },
    })
    .catch(() => {});

  void notifySignup(email, parsed.data.name);

  if (!mail.ok) {
    return NextResponse.json({
      ok: true,
      needsVerification: true,
      warning: "Llogaria u krijua por emaili i konfirmimit dështoi (SMTP). Kontakto adminin.",
    });
  }

  return NextResponse.json({
    ok: true,
    needsVerification: true,
    message: "Kontrollo emailin për lidhjen e konfirmimit.",
  });
}

async function notifySignup(email: string, name: string) {
  try {
    const { enabled, config } = await getIntegrationSecrets("telegram");
    if (!enabled) return;
    const cfg = config as TelegramConfig;
    if (!cfg.botToken || !cfg.defaultChatId) return;
    await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.defaultChatId,
        text: `👤 <b>Signup i ri</b>: ${name} · ${email} — pret miratim admini`,
        parse_mode: "HTML",
      }),
    });
    await prisma.notificationLog.create({
      data: {
        eventType: "user.signup",
        channel: "telegram",
        status: "sent",
        target: cfg.defaultChatId,
        detail: { email, name },
      },
    });
  } catch {
    /* ignore */
  }
}
