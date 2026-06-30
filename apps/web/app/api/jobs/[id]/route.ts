import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job nuk u gjet" }, { status: 404 });

  let output: unknown = null;
  if (job.output) {
    try {
      output = JSON.parse(job.output);
    } catch {
      output = job.output;
    }
  }

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    error: job.error,
    output,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
