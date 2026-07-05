import { NextResponse } from "next/server";
import { prisma, Prisma } from "@oltflow/db";
import { createFiberSchema } from "@oltflow/core";
import { requireUser } from "@/lib/auth";

// Create a fiber run drawn on the map (backbone / distribution / drop). OPERATE tier.
export async function POST(request: Request) {
  await requireUser();
  const parsed = createFiberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const d = parsed.data;
  const fiber = await prisma.fiberSegment.create({
    data: {
      name: d.name ?? null,
      kind: d.kind,
      path: d.path as unknown as Prisma.InputJsonValue,
      oltId: d.oltId ?? null,
      cores: d.cores ?? null,
      lengthM: d.lengthM ?? null,
    },
  });
  return NextResponse.json({ fiber }, { status: 201 });
}
