import { NextResponse } from "next/server";
import { prisma, Prisma } from "@oltflow/db";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";

/** Fleet CPE list from the AcsDevice mirror. */
export async function GET(request: Request) {
  const session = await requireUser();
  const allowed = await allowedOltIds(session);
  const url = new URL(request.url);
  const neverInformed = url.searchParams.get("neverInformed") === "1";
  const fw = url.searchParams.get("firmware") || undefined;
  const q = url.searchParams.get("q")?.trim();
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  const staleBefore = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Shared filter so the page count and the row window stay in sync. Order is by
  // lastInform (nullable, non-unique) so keyset isn't safe here — offset paginate.
  // Each optional filter is its own AND clause: stacking them as sibling `OR` keys
  // on one object would clobber (last OR wins) and silently drop earlier filters.
  const filters: Prisma.AcsDeviceWhereInput[] = [{ NOT: { deviceId: { startsWith: "pending:" } } }];
  if (fw) filters.push({ softwareVersion: fw });
  if (neverInformed) filters.push({ OR: [{ lastInform: null }, { lastInform: { lt: staleBefore } }] });
  if (q) {
    filters.push({
      OR: [
        { serial: { contains: q, mode: "insensitive" } },
        { modelName: { contains: q, mode: "insensitive" } },
        { wanIp: { contains: q } },
        { softwareVersion: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (allowed !== "all") {
    filters.push({ OR: [{ onuId: null }, { onu: { oltId: { in: allowed } } }] });
  }
  const where: Prisma.AcsDeviceWhereInput = { AND: filters };

  const [total, devices] = await Promise.all([
    prisma.acsDevice.count({ where }),
    prisma.acsDevice.findMany({
      where,
      orderBy: [{ lastInform: "desc" }, { mirroredAt: "desc" }],
      skip: offset,
      take,
      include: {
        onu: { select: { id: true, name: true, ponPort: true, oltId: true, olt: { select: { name: true } } } },
      },
    }),
  ]);

  const nextOffset = offset + devices.length < total ? offset + devices.length : null;

  return NextResponse.json({
    total,
    nextOffset,
    devices: devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      serial: d.serial,
      modelName: d.modelName,
      softwareVersion: d.softwareVersion,
      hardwareVersion: d.hardwareVersion,
      wanIp: d.wanIp,
      wanMode: d.wanMode,
      ssid2g: d.ssid2g,
      ssid5g: d.ssid5g,
      lastInform: d.lastInform?.toISOString() ?? null,
      mirroredAt: d.mirroredAt.toISOString(),
      lanHostCount: Array.isArray(d.lanHosts) ? d.lanHosts.length : 0,
      onuId: d.onuId,
      onuName: d.onu?.name ?? null,
      ponPort: d.onu?.ponPort ?? null,
      oltName: d.onu?.olt.name ?? null,
    })),
  });
}
