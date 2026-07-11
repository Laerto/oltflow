import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { Queue } from "bullmq";
import { QUEUE_NAME } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const url = new URL(REDIS_URL);
const connection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  password: url.password || undefined,
  maxRetriesPerRequest: null as null,
};

/** Retry a failed job (re-enqueue) or discard (mark discarded). Body: { action: "retry"|"discard" } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePerm("jobs.manage");
  if ("error" in denied && denied.error) return denied.error;
  const session = denied.session!;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action as string | undefined;
  if (action !== "retry" && action !== "discard") {
    return NextResponse.json({ error: "action duhet të jetë retry ose discard" }, { status: 400 });
  }

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job nuk u gjet" }, { status: 404 });

  if (action === "discard") {
    await prisma.job.update({
      where: { id },
      data: { status: "failed", error: job.error ? `${job.error} [discarded]` : "discarded by admin" },
    });
    await prisma.auditLog
      .create({
        data: {
          userId: Number(session.sub),
          action: "job_discard",
          result: "success",
          payload: { jobId: id, type: job.type },
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // retry: re-enqueue with same payload
  const payload = (job.payload as Record<string, unknown> | null) ?? {};
  const queue = new Queue(QUEUE_NAME, { connection });
  try {
    await prisma.job.update({
      where: { id },
      data: { status: "queued", error: null, output: null },
    });
    await queue.add(job.type, { ...payload, jobRowId: id }, { jobId: `${id}-retry-${Date.now()}` });
    await prisma.auditLog
      .create({
        data: {
          userId: Number(session.sub),
          action: "job_retry",
          result: "success",
          payload: { jobId: id, type: job.type },
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  } finally {
    await queue.close().catch(() => {});
  }
}
