import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requirePerm } from "@/lib/authorize";

/** Filterable audit log for /admin/audit. Supports CSV via ?format=csv. */
export async function GET(request: Request) {
  const denied = await requirePerm("audit.view");
  if ("error" in denied && denied.error) return denied.error;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || undefined;
  const result = url.searchParams.get("result") || undefined;
  const oltId = url.searchParams.get("oltId");
  const userId = url.searchParams.get("userId");
  const q = url.searchParams.get("q")?.trim();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const format = url.searchParams.get("format");
  const take = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  // Keyset cursor: id is autoincrement BigInt, so `id desc` == newest-first and a
  // simple `id < cursor` pages backward through history without offset drift.
  const cursorRaw = url.searchParams.get("cursor");
  let cursor: bigint | undefined;
  if (cursorRaw && /^\d+$/.test(cursorRaw)) cursor = BigInt(cursorRaw);

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (result) where.result = result;
  if (oltId) where.oltId = Number(oltId);
  if (userId) where.userId = Number(userId);
  if (cursor !== undefined && format !== "csv") where.id = { lt: cursor };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { ponPort: { contains: q, mode: "insensitive" } },
    ];
  }

  // CSV exports the full capped window; the interactive view fetches one extra
  // row to know whether a "load more" is available.
  const isCsv = format === "csv";
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { id: "desc" },
    take: isCsv ? take : take + 1,
    include: { olt: { select: { name: true } } },
  });
  const hasMore = !isCsv && logs.length > take;
  if (hasMore) logs.pop();

  // Resolve user emails in one query
  const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is number => id != null))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows = logs.map((l) => ({
    id: l.id.toString(),
    action: l.action,
    result: l.result,
    oltId: l.oltId,
    oltName: l.olt?.name ?? null,
    ponPort: l.ponPort,
    userId: l.userId,
    userEmail: l.userId ? (userById.get(l.userId)?.email ?? null) : null,
    userName: l.userId ? (userById.get(l.userId)?.name ?? null) : null,
    payload: l.payload,
    createdAt: l.createdAt.toISOString(),
  }));

  if (format === "csv") {
    const cols = ["createdAt", "action", "result", "userEmail", "oltName", "ponPort"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join(
      "\n"
    );
    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const nextCursor = hasMore ? rows[rows.length - 1]!.id : null;
  return NextResponse.json({ logs: rows, nextCursor });
}
