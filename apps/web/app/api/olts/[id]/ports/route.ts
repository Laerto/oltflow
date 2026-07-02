import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { DEFAULT_PORTS_PER_SLOT, DEFAULT_EPON_PORTS_PER_SLOT } from "@oltflow/core";
import { requireUser } from "@/lib/auth";

interface Port {
  port: number;
  total: number;
  online: number;
}
interface CardSlot {
  slot: number;
  kind: "gpon" | "epon";
  card: string;
  ports: Port[];
}

// Per slot/port ONU rollup for the OLT chassis map. One flat DB read, grouped in memory
// by parsing the ponPort (gpon-onu_<frame>/<slot>/<port>:<id>).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const oltId = Number(id);

  const olt = await prisma.olt.findUnique({
    where: { id: oltId },
    select: { name: true, slots: true, eponSlots: true },
  });
  if (!olt) return NextResponse.json({ error: "OLT nuk u gjet" }, { status: 404 });

  const onus = await prisma.onu.findMany({ where: { oltId }, select: { ponPort: true, state: true } });

  // slot -> port -> {total, online}
  const agg = new Map<number, Map<number, Port>>();
  for (const o of onus) {
    const m = /_(\d+)\/(\d+)\/(\d+):/.exec(o.ponPort);
    if (!m) continue;
    const slot = Number(m[2]);
    const port = Number(m[3]);
    if (!agg.has(slot)) agg.set(slot, new Map());
    const ports = agg.get(slot)!;
    const cur = ports.get(port) ?? { port, total: 0, online: 0 };
    cur.total += 1;
    if (o.state === "working") cur.online += 1;
    ports.set(port, cur);
  }

  const build = (slot: number, kind: "gpon" | "epon", count: number): CardSlot => {
    const ports: Port[] = [];
    const found = agg.get(slot);
    for (let p = 1; p <= count; p++) {
      ports.push(found?.get(p) ?? { port: p, total: 0, online: 0 });
    }
    return { slot, kind, card: kind === "gpon" ? "GTGH" : "ETTO", ports };
  };

  const cards: CardSlot[] = [
    ...olt.slots.map((s) => build(s, "gpon", DEFAULT_PORTS_PER_SLOT)),
    ...olt.eponSlots.map((s) => build(s, "epon", DEFAULT_EPON_PORTS_PER_SLOT)),
  ].sort((a, b) => a.slot - b.slot);

  return NextResponse.json({ name: olt.name, cards });
}
