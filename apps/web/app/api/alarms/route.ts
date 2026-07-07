import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";

// A live alarm feed for the header bell — computed from DB state on each poll (cheap at fleet
// scale), scoped to the user's OLTs. Ordered by blast radius: whole OLT down → PON port/card
// outage → individual customer at danger signal. The office watches this on the PC all day.
const DANGER_DBM = Number(process.env.SIGNAL_DANGER_DBM ?? -30);
const PORT_MIN_ONUS = 3; // a PON port needs at least this many ONUs before "mostly offline" means a shared fault
const PORT_CRITICAL = 0.8; // ≥80% of a port's ONUs offline ⇒ outage (card/fiber); ≥50% ⇒ warning
const PORT_WARNING = 0.5;
const MAX_ONU_SIGNAL_ITEMS = 50;

type Severity = "critical" | "warning";
interface AlarmItem {
  id: string;
  severity: Severity;
  kind: "olt_offline" | "port_outage" | "onu_signal";
  title: string;
  detail: string;
  href?: string;
}

export async function GET() {
  const session = await requireUser();
  const allowed = await allowedOltIds(session);
  const oltWhere = allowed === "all" ? {} : { id: { in: allowed } };
  const onuWhere = allowed === "all" ? {} : { oltId: { in: allowed } };

  const [olts, onus] = await Promise.all([
    prisma.olt.findMany({ where: oltWhere, select: { id: true, name: true, status: true } }),
    prisma.onu.findMany({
      where: onuWhere,
      select: {
        id: true,
        name: true,
        ponPort: true,
        oltId: true,
        state: true,
        signals: { take: 1, orderBy: { recordedAt: "desc" }, select: { onuRx: true } },
      },
    }),
  ]);

  const oltById = new Map(olts.map((o) => [o.id, o]));
  const offlineOltIds = new Set(olts.filter((o) => o.status === "offline").map((o) => o.id));

  const items: AlarmItem[] = [];

  // 1) Whole OLT down — power off / unreachable. Highest blast radius.
  for (const o of olts) {
    if (o.status === "offline") {
      items.push({
        id: `olt-${o.id}`,
        severity: "critical",
        kind: "olt_offline",
        title: `${o.name} — OLT pa lidhje`,
        detail: "Power off ose s'arrihet nga rrjeti",
        href: "/olts",
      });
    }
  }

  // 2) PON-port / card outage — most ONUs on one port offline at once points at a shared
  //    fault (card GTGH / fiber / splitter), not individual CPEs. Skip OLTs already flagged
  //    down so we don't double-report their every port.
  const ports = new Map<string, { oltId: number; port: string; total: number; offline: number }>();
  for (const o of onus) {
    if (offlineOltIds.has(o.oltId)) continue;
    const port = o.ponPort.replace(/:\d+$/, "").replace(/^gpon-onu_/, "gpon-olt_").replace(/^epon-onu_/, "epon-olt_");
    const key = `${o.oltId}|${port}`;
    const g = ports.get(key) ?? { oltId: o.oltId, port, total: 0, offline: 0 };
    g.total++;
    if (o.state && o.state !== "working") g.offline++;
    ports.set(key, g);
  }
  for (const p of ports.values()) {
    if (p.total < PORT_MIN_ONUS || p.offline === 0) continue;
    const ratio = p.offline / p.total;
    if (ratio < PORT_WARNING) continue;
    const shortPort = p.port.replace("gpon-olt_", "").replace("epon-olt_", "");
    items.push({
      id: `port-${p.oltId}-${p.port}`,
      severity: ratio >= PORT_CRITICAL ? "critical" : "warning",
      kind: "port_outage",
      title: `${oltById.get(p.oltId)?.name ?? "OLT"} · porti ${shortPort} — ${p.offline}/${p.total} ONU offline`,
      detail: "Mundësi problem karte/fibri (blast radius)",
      href: "/onus",
    });
  }

  // 3) Individual customers at danger signal (≤ DANGER_DBM), worst first. Working ONUs only —
  //    an offline one is covered above. Capped so the feed stays scannable.
  const danger = onus
    .filter((o) => o.state === "working")
    .map((o) => ({ o, rx: o.signals[0]?.onuRx ?? null }))
    .filter((x): x is { o: (typeof onus)[number]; rx: number } => x.rx !== null && x.rx <= DANGER_DBM)
    .sort((a, b) => a.rx - b.rx);
  for (const { o, rx } of danger.slice(0, MAX_ONU_SIGNAL_ITEMS)) {
    items.push({
      id: `onu-${o.id}`,
      severity: "critical",
      kind: "onu_signal",
      title: `${o.name || o.ponPort.replace(/^gpon-onu_|^epon-onu_/, "")} — ${rx} dBm`,
      detail: `${oltById.get(o.oltId)?.name ?? ""} · sinjal në rrezik`,
      href: `/onus/${o.id}`,
    });
  }

  const counts = {
    critical: items.filter((i) => i.severity === "critical").length,
    warning: items.filter((i) => i.severity === "warning").length,
  };
  return NextResponse.json({ items, counts });
}
