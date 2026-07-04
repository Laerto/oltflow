import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { getWifiInfo } from "@oltflow/adapters";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess } from "@/lib/olt-access";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
  const onu = await prisma.onu.findUnique({ where: { id: Number(id) } });
  if (!onu?.serial) return NextResponse.json({ devices: [] });

  try {
    const devices = await getWifiInfo(GENIEACS_URL, onu.serial);
    return NextResponse.json({ devices });
  } catch {
    return NextResponse.json({ devices: [] });
  }
}
