import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { createSplitterSchema } from "@oltflow/core";
import { requireUser } from "@/lib/auth";

// Create an ODN splitter node (placed on the map). OPERATE tier (proxy.ts).
export async function POST(request: Request) {
  await requireUser();
  const parsed = createSplitterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const d = parsed.data;
  const splitter = await prisma.splitter.create({
    data: {
      name: d.name,
      ratio: d.ratio,
      latitude: d.latitude,
      longitude: d.longitude,
      oltId: d.oltId ?? null,
      ponPort: d.ponPort ?? null,
      parentSplitterId: d.parentSplitterId ?? null,
      note: d.note ?? null,
    },
  });
  return NextResponse.json({ splitter }, { status: 201 });
}
