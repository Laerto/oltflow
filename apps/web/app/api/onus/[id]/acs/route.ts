import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { JOB_NAMES } from "@oltflow/core";
import { getLanPorts } from "@oltflow/adapters";
import { requireUser } from "@/lib/auth";
import { guardOnuAccess } from "@/lib/olt-access";
import { requirePerm } from "@/lib/authorize";
import { enqueueJob } from "@/lib/queue";

const GENIEACS_URL = process.env.GENIEACS_URL ?? "";

/** Read ACS mirror for this ONU (no live NBI call). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const onuId = Number((await params).id);
  const denied = await guardOnuAccess(onuId);
  if (denied) return denied;

  const onu = await prisma.onu.findUnique({ where: { id: onuId }, select: { id: true, serial: true } });
  if (!onu) return NextResponse.json({ error: "ONU not found" }, { status: 404 });

  let acs =
    (await prisma.acsDevice.findFirst({ where: { onuId } })) ??
    (onu.serial
      ? await prisma.acsDevice.findFirst({
          where: { serial: { equals: onu.serial, mode: "insensitive" } },
        })
      : null);

  // Live per-port LAN status (LAN1..LAN4) — best-effort; the mirror doesn't store it and the
  // link state changes often, so read it fresh from NBI. Skipped for pending/unlinked devices.
  const lanPorts =
    acs && GENIEACS_URL && !acs.deviceId.startsWith("pending:")
      ? await getLanPorts(GENIEACS_URL, acs.deviceId).catch(() => [])
      : [];

  return NextResponse.json({
    acs: acs
      ? {
          lanPorts,
          deviceId: acs.deviceId,
          serial: acs.serial,
          productClass: acs.productClass,
          modelName: acs.modelName,
          hardwareVersion: acs.hardwareVersion,
          softwareVersion: acs.softwareVersion,
          wanIp: acs.wanIp,
          wanMode: acs.wanMode,
          uptimeSec: acs.uptimeSec,
          ssid2g: acs.ssid2g,
          ssid5g: acs.ssid5g,
          wifiEnabled2g: acs.wifiEnabled2g,
          wifiEnabled5g: acs.wifiEnabled5g,
          lanHosts: acs.lanHosts,
          lastInform: acs.lastInform?.toISOString() ?? null,
          lastBootstrap: acs.lastBootstrap?.toISOString() ?? null,
          registered: acs.registered,
          mirroredAt: acs.mirroredAt.toISOString(),
          expectedBy: acs.expectedBy?.toISOString() ?? null,
          pending: acs.deviceId.startsWith("pending:"),
        }
      : null,
  });
}

/** Enqueue targeted ACS refresh for this ONU. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePerm("onu.view");
  if ("error" in auth) return auth.error;
  const onuId = Number((await params).id);
  const denied = await guardOnuAccess(onuId);
  if (denied) return denied;

  const onu = await prisma.onu.findUnique({ where: { id: onuId } });
  if (!onu?.serial) return NextResponse.json({ error: "ONU s'ka serial" }, { status: 400 });

  const jobId = await enqueueJob(JOB_NAMES.acsRefresh, { onuId, serial: onu.serial });
  return NextResponse.json({ jobId });
}
