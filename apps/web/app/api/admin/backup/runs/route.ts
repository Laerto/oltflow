import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";
import { enqueueJob } from "@/lib/queue";

export async function GET(request: Request) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

  const runs = await prisma.backupRun.findMany({
    orderBy: { startedAt: "desc" },
    take,
    include: { target: { select: { id: true, name: true, kind: true } } },
  });

  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      targetId: r.targetId,
      targetName: r.target?.name ?? null,
      targetKind: r.target?.kind ?? null,
      status: r.status,
      path: r.path,
      sizeBytes: r.sizeBytes != null ? Number(r.sizeBytes) : null,
      sha256: r.sha256,
      manifest: r.manifest,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      error: r.error,
      log: r.log,
    })),
  });
}

/** Start a backup now. Body: { targetId?: number } */
export async function POST(request: Request) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const targetId = body.targetId != null ? Number(body.targetId) : null;

  if (targetId) {
    const t = await prisma.backupTarget.findUnique({ where: { id: targetId } });
    if (!t) return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  const run = await prisma.backupRun.create({
    data: { targetId, status: "queued" },
  });

  const jobId = await enqueueJob(JOB_NAMES.backup, { runId: run.id, targetId }, {});
  // Also store job id in log for correlation
  await prisma.backupRun
    .update({ where: { id: run.id }, data: { log: `jobId=${jobId}` } })
    .catch(() => {});

  return NextResponse.json({ runId: run.id, jobId });
}
