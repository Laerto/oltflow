import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";
import { enqueueJob } from "@/lib/queue";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  const r = await prisma.backupRun.findUnique({
    where: { id },
    include: { target: { select: { name: true, kind: true } } },
  });
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });

  const backupDir = process.env.BACKUP_DIR ?? "/var/lib/oltflow/backups";
  const restoreCmd = r.path
    ? `./scripts/restore.sh ${backupDir}/${r.path}`
    : "./scripts/restore.sh /path/to/backup-run-dir";

  return NextResponse.json({
    run: {
      id: r.id,
      status: r.status,
      path: r.path,
      sizeBytes: r.sizeBytes != null ? Number(r.sizeBytes) : null,
      sha256: r.sha256,
      manifest: r.manifest,
      log: r.log,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      targetName: r.target?.name ?? null,
    },
    restoreCommand: restoreCmd,
  });
}

/** Body: { action: "verify" } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("backup.run");
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null);
  if (body?.action !== "verify") {
    return NextResponse.json({ error: "action must be verify" }, { status: 400 });
  }
  const run = await prisma.backupRun.findUnique({ where: { id } });
  if (!run || run.status === "failed" || run.status === "queued" || run.status === "running") {
    return NextResponse.json({ error: "Run not verifiable yet" }, { status: 400 });
  }
  const jobId = await enqueueJob(JOB_NAMES.backupVerify, { runId: id }, {});
  return NextResponse.json({ ok: true, jobId });
}
