import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";
import {
  generateToken,
  hashToken,
  resolveAppBaseUrl,
  sendInviteEmail,
} from "@/lib/mailer";

const schema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80).optional(),
});

/** Create a pending placeholder user + invite link email (pre-verified on signup). */
export async function POST(request: Request) {
  const auth = await requirePerm("users.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Email i pavlefshëm" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "Ky email ekziston tashmë" }, { status: 409 });
  }

  // Placeholder user: random password, pending until they complete invite signup
  // Actually for invite flow: we create token without user first... our schema requires userId.
  // Create disabled placeholder with unusable password; invite signup updates it.
  // Simpler: create active viewer with random password, send invite that is really a "reset+verify" style
  // Our signup with inviteToken: creates NEW user and marks invite used.
  // So invite token can be attached to a dummy user that gets replaced... messy.
  // Better: create the invite token on a temporary "system" approach —
  // Create user with random password, status pending, emailVerifiedAt null; invite token for kind=invite.
  // On signup WITH invite: we currently create a NEW user. Fix signup invite to UPDATE existing invite user.

  const passwordH = await bcrypt.hash(randomUUID() + randomUUID(), 10);
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name ?? null,
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
      kind: "invite",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const base = await resolveAppBaseUrl(request);
  const inviteUrl = `${base}/signup?invite=${encodeURIComponent(raw)}`;
  const mail = await sendInviteEmail(email, inviteUrl);

  await prisma.auditLog
    .create({
      data: {
        userId: Number(session.sub),
        action: "user_invite",
        result: mail.ok ? "success" : "error",
        payload: { email, mailError: mail.error ?? null },
      },
    })
    .catch(() => {});

  if (!mail.ok) {
    return NextResponse.json({
      ok: true,
      warning: `Ftesa u krijua por emaili dështoi: ${mail.error}`,
      inviteUrl, // admin can copy-paste
    });
  }

  return NextResponse.json({ ok: true, inviteUrl });
}
