import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@oltflow/core";
import { findUserByEmail, createSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email/password të pavlefshme" }, { status: 400 });
  }

  const user = await findUserByEmail(parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: "Kredencialet janë të gabuara" }, { status: 401 });
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordH);
  if (!ok) {
    return NextResponse.json({ error: "Kredencialet janë të gabuara" }, { status: 401 });
  }

  await createSessionCookie({ sub: String(user.id), email: user.email, name: user.name, role: user.role });
  return NextResponse.json({ ok: true });
}
