import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";

/**
 * NOC alarm centre — reads the persisted Alarm table (worker opens/clears rows each
 * tick). Cheap indexed query instead of a full fleet scan. Scoped to the user's OLTs;
 * silences and acks (Phase 3 UI) are filtered out of the live feed.
 */

// Map stored types → UI kinds the AlarmBell already understands.
const TYPE_TO_KIND: Record<string, "olt_offline" | "port_outage" | "onu_signal" | "onu_offline" | "onu_expiry"> = {
  "olt.unreachable": "olt_offline",
  "pon.outage": "port_outage",
  "onu.signal.danger": "onu_signal",
  "onu.signal.warning": "onu_signal",
  "onu.offline": "onu_offline",
  "onu.expiry": "onu_expiry",
};

// Live feed prefers blast-radius + customer-danger first; expiry is lower priority.
const TYPE_PRIORITY: Record<string, number> = {
  "olt.unreachable": 0,
  "pon.outage": 1,
  "onu.signal.danger": 2,
  "onu.offline": 3,
  "onu.signal.warning": 4,
  "onu.expiry": 5,
};

const MAX_ITEMS = 80;

export async function GET() {
  const session = await requireUser();
  const allowed = await allowedOltIds(session);
  const now = new Date();

  const where =
    allowed === "all"
      ? {
          clearedAt: null,
          OR: [{ silencedUntil: null }, { silencedUntil: { lt: now } }],
        }
      : {
          clearedAt: null,
          OR: [{ silencedUntil: null }, { silencedUntil: { lt: now } }],
          // Global (no olt) alarms + scoped OLT alarms.
          AND: [{ OR: [{ oltId: null }, { oltId: { in: allowed } }] }],
        };

  // Only surface types the NOC bell cares about (drop weak/expiry from the header feed
  // if volume is high — still return them with a lower priority so the list is complete).
  const rows = await prisma.alarm.findMany({
    where,
    orderBy: [{ severity: "asc" }, { openedAt: "desc" }], // critical first (c < w alphabetically… fix below)
    take: 200,
    select: {
      id: true,
      key: true,
      type: true,
      severity: true,
      title: true,
      detail: true,
      href: true,
      openedAt: true,
      ackedAt: true,
    },
  });

  // Severity order: critical before warning; then type priority; then newest.
  const sorted = [...rows].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    const pa = TYPE_PRIORITY[a.type] ?? 9;
    const pb = TYPE_PRIORITY[b.type] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.openedAt.getTime() - a.openedAt.getTime();
  });

  // Header feed: prefer OLT/port/danger; cap total so the dropdown stays scannable.
  const preferred = sorted.filter((r) =>
    ["olt.unreachable", "pon.outage", "onu.signal.danger"].includes(r.type)
  );
  const rest = sorted.filter((r) => !["olt.unreachable", "pon.outage", "onu.signal.danger"].includes(r.type));
  const feed = [...preferred, ...rest].slice(0, MAX_ITEMS);

  const items = feed.map((r) => ({
    id: r.key,
    severity: (r.severity === "critical" ? "critical" : "warning") as "critical" | "warning",
    kind: TYPE_TO_KIND[r.type] ?? "onu_signal",
    title: r.title,
    detail: r.detail ?? "",
    href: r.href ?? undefined,
    acked: Boolean(r.ackedAt),
  }));

  const counts = {
    critical: items.filter((i) => i.severity === "critical" && !i.acked).length,
    warning: items.filter((i) => i.severity === "warning" && !i.acked).length,
  };

  return NextResponse.json({ items, counts });
}
