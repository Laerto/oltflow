import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { createOltSchema, encryptSecret, JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/queue";

const OLT_CRED_KEY = process.env.OLT_CRED_KEY ?? "";

export async function GET() {
  await requireUser();
  const olts = await prisma.olt.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { onus: true } } },
  });

  const withCounts = await Promise.all(
    olts.map(async (olt) => {
      const online = await prisma.onu.count({ where: { oltId: olt.id, state: "working" } });
      const offline = olt._count.onus - online;
      return {
        id: olt.id,
        name: olt.name,
        ip: olt.ip,
        port: olt.port,
        protocol: olt.protocol,
        username: olt.username,
        slots: olt.slots,
        eponSlots: olt.eponSlots,
        location: olt.location,
        status: olt.status,
        lastSync: olt.lastSync,
        total: olt._count.onus,
        online,
        offline,
      };
    })
  );

  return NextResponse.json({ olts: withCounts });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = createOltSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const input = parsed.data;

  const olt = await prisma.olt.create({
    data: {
      name: input.name,
      ip: input.ip,
      port: input.port,
      protocol: input.protocol,
      username: input.username,
      passwordEnc: encryptSecret(input.password, OLT_CRED_KEY),
      location: input.location,
      model: input.model,
      slots: input.slots,
      eponSlots: input.eponSlots,
    },
  });

  await prisma.auditLog.create({
    data: { action: "add_olt", oltId: olt.id, result: "success", userId: Number(user.sub), payload: { name: olt.name, ip: olt.ip } },
  });

  const jobId = await enqueueJob(JOB_NAMES.oltConnectTest, { oltId: olt.id }, { oltId: olt.id });

  return NextResponse.json({ olt: { id: olt.id, name: olt.name, ip: olt.ip }, jobId }, { status: 201 });
}
