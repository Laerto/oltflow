import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { getWanIpsBySerial } from "@oltflow/adapters";
import { JOB_NAMES, isEponPort, onuConnectionKind } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { enqueueJob } from "@/lib/queue";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const onu = await prisma.onu.findUnique({
    where: { id: Number(id) },
    include: { signals: { orderBy: { recordedAt: "desc" }, take: 1 }, olt: { select: { id: true, name: true } } },
  });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });

  const signal = onu.signals[0];
  const wanIps = onu.serial
    ? await getWanIpsBySerial(GENIEACS_URL, [onu.serial]).catch(() => new Map<string, string>())
    : new Map<string, string>();
  const acsIp = (onu.serial && wanIps.get(onu.serial.toUpperCase())) || null;
  const bridge = onuConnectionKind(onu.type) === "bridge";
  return NextResponse.json({
    id: onu.id,
    oltId: onu.oltId,
    oltName: onu.olt.name,
    ponPort: onu.ponPort,
    serial: onu.serial,
    name: onu.name,
    type: onu.type,
    state: onu.state,
    distance: onu.distance,
    onlineDuration: onu.onlineDuration,
    vlan: onu.vlan,
    pppoeUser: onu.pppoeUser,
    lineProfile: onu.lineProfile,
    serviceProfile: onu.serviceProfile,
    mac: onu.mac,
    mgmtIp: bridge ? onu.mgmtIp : null,
    expiration: onu.expiration ? onu.expiration.toISOString() : null,
    customer: null,
    lastSeen: onu.lastSeen,
    wanIp: bridge ? acsIp : onu.mgmtIp || acsIp,
    onuRx: signal?.onuRx ?? null,
    onuTx: signal?.onuTx ?? null,
    oltRx: signal?.oltRx ?? null,
    oltTx: signal?.oltTx ?? null,
    attenUp: signal?.attenUp ?? null,
    attenDown: signal?.attenDown ?? null,
    signalLevel: signal?.signalLevel ?? null,
  });
}

// Sets the management IP (Mikrotik behind a bridge ONU) used by the Winbox launcher.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { mgmtIp?: unknown };
  const raw = typeof body.mgmtIp === "string" ? body.mgmtIp.trim() : "";
  const ipOk = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  if (raw && !ipOk.test(raw)) {
    return NextResponse.json({ error: "IP jo e vlefshme" }, { status: 400 });
  }
  await prisma.onu.update({ where: { id: Number(id) }, data: { mgmtIp: raw || null } });
  return NextResponse.json({ ok: true, mgmtIp: raw || null });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const onu = await prisma.onu.findUnique({ where: { id: Number(id) } });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });

  // De-provisioning sends GPON CLI against the OLT interface; EPON uses a different tree.
  if (isEponPort(onu.ponPort)) {
    return NextResponse.json({ error: "Fshirja e ONU-ve EPON nuk mbështetet" }, { status: 400 });
  }

  const jobId = await enqueueJob(
    JOB_NAMES.deleteOnu,
    { oltId: onu.oltId, onuId: onu.id, ponPort: onu.ponPort },
    { oltId: onu.oltId, ponPort: onu.ponPort }
  );
  return NextResponse.json({ jobId });
}
