import { NextResponse } from "next/server";
import { verifyEmailSchema } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { hashToken } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/auth-rate-limit";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit(`oltflow:verify:${ip}`, 20);
  if (!rl.ok) {
    return NextResponse.json({ error: "Shumë tentativa — provo më vonë" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Token i pavlefshëm" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  const row = await prisma.verificationToken.findFirst({
    where: { tokenHash, kind: "verify", usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Lidhja është e pavlefshme ose e skaduar" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);

  await prisma.auditLog
    .create({
      data: {
        userId: row.userId,
        action: "email_verify",
        result: "success",
        payload: { email: row.user.email, ip },
      },
    })
    .catch(() => {});

  return NextResponse.json({
    ok: true,
    message:
      row.user.status === "active"
        ? "Email u konfirmua — mund të hyni."
        : "Email u konfirmua. Pritni miratimin e administratorit për të hyrë.",
    status: row.user.status,
  });
}
