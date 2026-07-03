import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { createOltSchema, encryptSecret, JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { enqueueJob, enqueueUntracked } from "@/lib/queue";

const OLT_CRED_KEY = process.env.OLT_CRED_KEY ?? "";

export async function GET() {
  await requireUser();
  // Two flat queries instead of 1 + N counts: list the OLTs, then roll up ONU
  // totals/online counts for all of them in a single grouped aggregate.
  const [olts, grouped] = await Promise.all([
    prisma.olt.findMany({ orderBy: { name: "asc" } }),
    prisma.onu.groupBy({ by: ["oltId", "state"], _count: { _all: true } }),
  ]);

  const totals = new Map<number, { total: number; online: number }>();
  for (const row of grouped) {
    const acc = totals.get(row.oltId) ?? { total: 0, online: 0 };
    acc.total += row._count._all;
    if (row.state === "working") acc.online += row._count._all;
    totals.set(row.oltId, acc);
  }

  const withCounts = olts.map((olt) => {
    const { total, online } = totals.get(olt.id) ?? { total: 0, online: 0 };
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
      total,
      online,
      offline: total - online,
    };
  });

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
      enablePasswordEnc: input.enablePassword ? encryptSecret(input.enablePassword, OLT_CRED_KEY) : null,
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

  // Kick the first inventory/detail/signal sweep right now so the new OLT populates within
  // seconds. Previously these ran only on the next scheduler tick, so a freshly-added OLT
  // showed zero ONUs until the worker next restarted (which forced an immediate tick). The
  // delays stagger the sweeps behind the connect-test so they don't fight over the OLT lock.
  await enqueueUntracked(JOB_NAMES.syncInventory, { oltId: olt.id }, 2_000);
  await enqueueUntracked(JOB_NAMES.syncSignals, { oltId: olt.id }, 4_000);
  await enqueueUntracked(JOB_NAMES.syncDetail, { oltId: olt.id }, 6_000);

  return NextResponse.json({ olt: { id: olt.id, name: olt.name, ip: olt.ip }, jobId }, { status: 201 });
}
