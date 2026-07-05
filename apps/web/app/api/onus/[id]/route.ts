import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { getWanIpsBySerial } from "@oltflow/adapters";
import { JOB_NAMES, isEponPort, onuConnectionKind } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess } from "@/lib/olt-access";
import { enqueueJob } from "@/lib/queue";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
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

// Sets the management IP (Mikrotik behind a bridge ONU) used by the Winbox launcher, and/or
// the ONU's geolocation (network map). Only the fields present in the body are updated.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { mgmtIp?: unknown; latitude?: unknown; longitude?: unknown };

  const data: { mgmtIp?: string | null; latitude?: number | null; longitude?: number | null } = {};
  if ("mgmtIp" in body) {
    const raw = typeof body.mgmtIp === "string" ? body.mgmtIp.trim() : "";
    const ipOk = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
    if (raw && !ipOk.test(raw)) return NextResponse.json({ error: "IP jo e vlefshme" }, { status: 400 });
    data.mgmtIp = raw || null;
  }
  if ("latitude" in body || "longitude" in body) {
    if (body.latitude === null || body.longitude === null) {
      data.latitude = null;
      data.longitude = null;
    } else {
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return NextResponse.json({ error: "Koordinata jo të vlefshme" }, { status: 400 });
      }
      data.latitude = lat;
      data.longitude = lng;
    }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Asgjë për të ndryshuar" }, { status: 400 });

  const onu = await prisma.onu.update({ where: { id: Number(id) }, data });
  await prisma.auditLog
    .create({
      data: {
        action: data.latitude !== undefined ? "set_onu_location" : "set_mgmt_ip",
        oltId: onu.oltId,
        ponPort: onu.ponPort,
        result: "success",
        userId: Number(user.sub),
        payload: JSON.parse(JSON.stringify(data)),
      },
    })
    .catch(() => {});
  return NextResponse.json({ ok: true, mgmtIp: onu.mgmtIp, latitude: onu.latitude, longitude: onu.longitude });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const denied = await guardOnuAccess(Number(id));
  if (denied) return denied;
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
