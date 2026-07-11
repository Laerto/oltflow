import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { resetPasswordSchema } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { hashToken } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/auth-rate-limit";
import { revokeAllUserSessions } from "@/lib/auth";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit(`oltflow:reset:${ip}`, 10);
  if (!rl.ok) {
    return NextResponse.json({ error: "Shumë tentativa — provo më vonë" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Të dhëna të pavlefshme (password min 8)" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  const row = await prisma.verificationToken.findFirst({
    where: { tokenHash, kind: "reset", usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) {
    return NextResponse.json({ error: "Lidhja është e pavlefshme ose e skaduar" }, { status: 400 });
  }

  const passwordH = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordH } }),
    prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);

  // Force re-login everywhere
  await revokeAllUserSessions(row.userId);

  await prisma.auditLog
    .create({
      data: {
        userId: row.userId,
        action: "password_reset",
        result: "success",
        payload: { ip },
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true, message: "Fjalëkalimi u ndryshua — hyni me fjalëkalimin e ri." });
}
