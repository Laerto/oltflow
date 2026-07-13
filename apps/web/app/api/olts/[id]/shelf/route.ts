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

  // slot -> {total, online} and slot:port -> {total, online} rollups from ponPort
  // (…_<frame>/<slot>/<port>:<id>). Per-port counts feed the chassis port grid.
  const onus = await prisma.onu.findMany({ where: { oltId }, select: { ponPort: true, state: true } });
  const bySlot = new Map<number, { total: number; online: number }>();
  const byPort = new Map<string, { total: number; online: number }>();
  for (const o of onus) {
    const m = /_(\d+)\/(\d+)\/(\d+):/.exec(o.ponPort);
    if (!m) continue;
    const slot = Number(m[2]);
    const port = Number(m[3]);
    const working = o.state === "working";
    const cur = bySlot.get(slot) ?? { total: 0, online: 0 };
    cur.total += 1;
    if (working) cur.online += 1;
    bySlot.set(slot, cur);
    const pk = `${slot}:${port}`;
    const pcur = byPort.get(pk) ?? { total: 0, online: 0 };
    pcur.total += 1;
    if (working) pcur.online += 1;
    byPort.set(pk, pcur);
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
    .map((c) => {
      const isAccess = c.role === "gpon" || c.role === "epon";
      if (!isAccess) return { ...c, onus: undefined, portOnus: undefined };
      const portCount = c.ports && c.ports > 0 ? c.ports : c.role === "epon" ? 8 : 16;
      const portOnus = Array.from({ length: portCount }, (_, i) => {
        const port = i + 1;
        return { port, ...(byPort.get(`${c.slot}:${port}`) ?? { total: 0, online: 0 }) };
      });
      return { ...c, onus: bySlot.get(c.slot) ?? { total: 0, online: 0 }, portOnus };
    })
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
