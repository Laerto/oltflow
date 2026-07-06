import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { createOltSchema, encryptSecret, JOB_NAMES } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";
import { enqueueJob, enqueueUntracked } from "@/lib/queue";

const OLT_CRED_KEY = process.env.OLT_CRED_KEY ?? "";

export async function GET() {
  const session = await requireUser();
  // Scope the list to the user's zone (support/viewer with an explicit assignment); admins
  // and unassigned users see all. This is the primary gate — a scoped user can't even pick
  // another zone's OLT in the selector, so every per-OLT page follows automatically.
  const allowed = await allowedOltIds(session);
  const oltWhere = allowed === "all" ? {} : { id: { in: allowed } };
  const onuWhere = allowed === "all" ? {} : { oltId: { in: allowed } };
  // Two flat queries instead of 1 + N counts: list the OLTs, then roll up ONU
  // totals/online counts for all of them in a single grouped aggregate.
  const [olts, grouped] = await Promise.all([
    prisma.olt.findMany({ where: oltWhere, orderBy: { name: "asc" } }),
    prisma.onu.groupBy({ by: ["oltId", "state"], _count: { _all: true }, where: onuWhere }),
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
      snmpCommunity: olt.snmpCommunity,
      latitude: olt.latitude,
      longitude: olt.longitude,
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
      snmpCommunity: input.snmpCommunity || undefined,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
  });

  await prisma.auditLog.create({
    data: { action: "add_olt", oltId: olt.id, result: "success", userId: Number(user.sub), payload: { name: olt.name, ip: olt.ip } },
  });

  const jobId = await enqueueJob(JOB_NAMES.oltConnectTest, { oltId: olt.id }, { oltId: olt.id });

  // Kick the first combined sweep right now so the new OLT populates within seconds (state +
  // signal + detail all run since nothing is "due" yet), instead of waiting the next tick.
  await enqueueUntracked(JOB_NAMES.syncOlt, { oltId: olt.id }, 2_000);

  return NextResponse.json({ olt: { id: olt.id, name: olt.name, ip: olt.ip }, jobId }, { status: 201 });
}
