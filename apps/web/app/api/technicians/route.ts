import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

// Assignable technicians for ticket assignment — office picks from these. Gated to OPERATE
// tier in proxy.ts (only support/admin assign). Returns just id/name/email (no secrets).
export async function GET() {
  await requireUser();
  const technicians = await prisma.user.findMany({
    where: { role: "technician" },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return NextResponse.json({ technicians });
}
