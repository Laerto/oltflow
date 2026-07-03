import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@oltflow/db";
import { userCreateSchema, roleRank, TIER } from "@oltflow/core";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  if (roleRank(session.role) < TIER.ADMIN) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = userCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Të dhëna të pavlefshme" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "Ky email ekziston tashmë" }, { status: 409 });
  }

  const passwordH = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: { email, name: parsed.data.name ?? null, passwordH, role: parsed.data.role },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return NextResponse.json({ user });
}
