import type { Prisma } from "@oltflow/db";
import { prisma } from "@oltflow/db";
import { SIGNAL_THRESHOLDS } from "@oltflow/core";

/**
 * Shared fleet ONU query: keyset pagination + server-side search/filters.
 * Powers GET /api/onus and GET /api/olts/[id]/onus so the UI never loads 50k rows.
 *
 * Cursor is the last `id` from the previous page (order: id asc). Search uses
 * indexed columns (serial, name, pppoeUser, mgmtIp) plus ponPort ILIKE.
 */

export const ONU_PAGE_DEFAULT = 100;
export const ONU_PAGE_MAX = 500;

export interface OnuListQuery {
  /** Restrict to these OLT ids ("all" = no filter). */
  allowedOlts: "all" | number[];
  /** Optional single-OLT filter (e.g. per-OLT page). */
  oltId?: number;
  q?: string;
  status?: "all" | "online" | "offline";
  /** Optical band using denormalized lastOnuRx / lastSignalLevel. */
  signal?: "all" | "good" | "warning" | "critical";
  cursor?: number;
  limit?: number;
}

export function parseOnuListParams(url: URL): Pick<OnuListQuery, "q" | "status" | "signal" | "cursor" | "limit"> {
  const q = url.searchParams.get("q")?.trim() || undefined;
  const statusRaw = url.searchParams.get("status");
  const status =
    statusRaw === "online" || statusRaw === "offline" || statusRaw === "all" ? statusRaw : "all";
  const signalRaw = url.searchParams.get("signal");
  const signal =
    signalRaw === "good" || signalRaw === "warning" || signalRaw === "critical" || signalRaw === "all"
      ? signalRaw
      : "all";
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && Number.isFinite(Number(cursorRaw)) ? Number(cursorRaw) : undefined;
  const limitRaw = url.searchParams.get("limit");
  let limit = ONU_PAGE_DEFAULT;
  if (limitRaw && Number.isFinite(Number(limitRaw))) {
    limit = Math.min(ONU_PAGE_MAX, Math.max(1, Number(limitRaw)));
  }
  return { q, status, signal, cursor, limit };
}

export function buildOnuWhere(query: OnuListQuery): Prisma.OnuWhereInput {
  return buildWhere(query);
}

function buildWhere(query: OnuListQuery): Prisma.OnuWhereInput {
  const parts: Prisma.OnuWhereInput[] = [];

  if (query.oltId !== undefined) {
    parts.push({ oltId: query.oltId });
  } else if (query.allowedOlts !== "all") {
    parts.push({ oltId: { in: query.allowedOlts } });
  }

  if (query.status === "online") {
    parts.push({ state: "working" });
  } else if (query.status === "offline") {
    parts.push({ AND: [{ state: { not: null } }, { NOT: { state: "working" } }] });
  }

  if (query.signal === "good") {
    parts.push({ lastOnuRx: { gte: SIGNAL_THRESHOLDS.good } });
  } else if (query.signal === "warning") {
    parts.push({
      lastOnuRx: { gte: SIGNAL_THRESHOLDS.warning, lt: SIGNAL_THRESHOLDS.good },
    });
  } else if (query.signal === "critical") {
    parts.push({ lastOnuRx: { lt: SIGNAL_THRESHOLDS.warning } });
  }

  if (query.q) {
    const term = query.q;
    parts.push({
      OR: [
        { serial: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { pppoeUser: { contains: term, mode: "insensitive" } },
        { mgmtIp: { contains: term, mode: "insensitive" } },
        { ponPort: { contains: term, mode: "insensitive" } },
        { mac: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (query.cursor !== undefined) {
    parts.push({ id: { gt: query.cursor } });
  }

  return parts.length ? { AND: parts } : {};
}

export async function listOnus(query: OnuListQuery) {
  const limit = Math.min(ONU_PAGE_MAX, Math.max(1, query.limit ?? ONU_PAGE_DEFAULT));
  const where = buildWhere(query);

  const [rows, total] = await Promise.all([
    prisma.onu.findMany({
      where,
      orderBy: [{ id: "asc" }],
      take: limit + 1, // one extra to detect hasMore
      include: {
        signals: { orderBy: { recordedAt: "desc" }, take: 1 },
        olt: { select: { name: true } },
      },
    }),
    // Count without cursor so the UI can show "X total matching".
    prisma.onu.count({
      where: buildWhere({ ...query, cursor: undefined }),
    }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.id : null;

  return { rows: page, total, nextCursor, limit };
}

/** Hard cap so a CSV export can never dump an unbounded fleet into memory. */
export const ONU_EXPORT_MAX = 100_000;
const EXPORT_BATCH = 2_000;

/**
 * Streams every ONU matching the same filters as {@link listOnus}, in keyset
 * batches (order id asc), and yields the shape the CSV writer needs. Ignores any
 * incoming `cursor`/`limit` — the export always starts from the top.
 */
export async function* iterateOnusForExport(
  query: Omit<OnuListQuery, "cursor" | "limit">
): AsyncGenerator<
  Prisma.OnuGetPayload<{ include: { signals: true; olt: { select: { name: true } } } }>
> {
  let cursor: number | undefined;
  let emitted = 0;
  for (;;) {
    const where = buildWhere({ ...query, cursor });
    const rows = await prisma.onu.findMany({
      where,
      orderBy: [{ id: "asc" }],
      take: EXPORT_BATCH,
      include: {
        signals: { orderBy: { recordedAt: "desc" }, take: 1 },
        olt: { select: { name: true } },
      },
    });
    if (rows.length === 0) return;
    for (const row of rows) {
      yield row;
      if (++emitted >= ONU_EXPORT_MAX) return;
    }
    if (rows.length < EXPORT_BATCH) return;
    cursor = rows[rows.length - 1]!.id;
  }
}
