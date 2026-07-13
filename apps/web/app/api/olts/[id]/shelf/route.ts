import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { guardOltAccess } from "@/lib/olt-access";

// NetNumen-style chassis view: the board inventory + uplink optical DDM is a periodic snapshot
// stored on Olt.shelf by the sync (scanCardInventory/scanUplinkOptical). Per-card ONU counts for
// GPON/EPON access boards are merged live from the Onu table so they always reflect current state.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);
  const denied = await guardOltAccess(oltId);
  if (denied) return denied;

  const olt = await prisma.olt.findUnique({
    where: { id: oltId },
    select: { name: true, slots: true, eponSlots: true, shelf: true },
  });
  if (!olt) return NextResponse.json({ error: "OLT nuk u gjet" }, { status: 404 });

  // slot -> {total, online} rollup from ponPort (…_<frame>/<slot>/<port>:<id>).
  const onus = await prisma.onu.findMany({ where: { oltId }, select: { ponPort: true, state: true } });
  const bySlot = new Map<number, { total: number; online: number }>();
  for (const o of onus) {
    const m = /_(\d+)\/(\d+)\/(\d+):/.exec(o.ponPort);
    if (!m) continue;
    const slot = Number(m[2]);
    const cur = bySlot.get(slot) ?? { total: 0, online: 0 };
    cur.total += 1;
    if (o.state === "working") cur.online += 1;
    bySlot.set(slot, cur);
  }

  const snap = (olt.shelf as { at?: string; cards?: ShelfCardJson[] } | null) ?? null;

  // If the shelf has never been synced, fall back to the configured access slots so the view
  // still renders (control/uplink/power boards appear after the first shelf sync).
  const baseCards: ShelfCardJson[] =
    snap?.cards ??
    [
      ...olt.slots.map((s) => ({ slot: s, cfgType: "", realType: "GTGH", role: "gpon" as const, status: "", ports: null })),
      ...olt.eponSlots.map((s) => ({ slot: s, cfgType: "", realType: "ETTO", role: "epon" as const, status: "", ports: null })),
    ];

  const cards = baseCards
    .map((c) => ({ ...c, onus: c.role === "gpon" || c.role === "epon" ? bySlot.get(c.slot) ?? { total: 0, online: 0 } : undefined }))
    .sort((a, b) => a.slot - b.slot);

  return NextResponse.json({ name: olt.name, at: snap?.at ?? null, cards });
}

interface ShelfCardJson {
  slot: number;
  cfgType: string;
  realType: string;
  role: string;
  status: string;
  ports: number | null;
  uplinks?: unknown[];
}
