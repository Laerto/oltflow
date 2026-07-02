import { prisma } from "@oltflow/db";
import { onuConnectionKind } from "@oltflow/core";
import { getRadiusData, normalizeMac } from "../radius.js";

/**
 * Enriches ONU rows with RADIUS data (runs in the worker, where mysql2 works):
 *  - route ONU  → matched by its PPPoE username
 *  - bridge ONU → matched by the learned MAC (downstream Mikrotik) → its session
 * Writes the live device IP into `mgmtIp` and the account expiry into `expiration`,
 * so the web tier just reads Postgres. Only writes rows whose value actually changed.
 */
export async function syncRadius(): Promise<number> {
  const data = await getRadiusData();
  if (!data) return 0;

  const onus = await prisma.onu.findMany({
    select: { id: true, type: true, pppoeUser: true, mac: true, mgmtIp: true, expiration: true },
  });

  let updated = 0;
  const batch: Promise<unknown>[] = [];
  for (const o of onus) {
    const macKey = o.mac ? normalizeMac(o.mac) : "";
    const session = macKey ? data.byMac.get(macKey) : undefined;
    // Resolve the subscriber: route uses pppoeUser, bridge uses the MAC's session username.
    const username = o.pppoeUser || session?.username || null;
    const client = username ? data.byUsername.get(username) : undefined;

    // For bridge ONUs mgmtIp is the Mikrotik IP (Winbox); for route ONUs it's the ONU's IP.
    const resolvedIp =
      onuConnectionKind(o.type) === "bridge"
        ? session?.liveIp || client?.staticIp || null
        : client?.liveIp || session?.liveIp || client?.staticIp || null;

    // Keep-last: never wipe a value RADIUS momentarily can't resolve (avoids flapping and
    // preserves a manually-set Winbox IP for clients not present in RADIUS).
    const nextMgmtIp = resolvedIp ?? o.mgmtIp ?? null;
    const nextExp = client?.expiration ?? o.expiration ?? null;

    const expChanged = (o.expiration?.getTime() ?? null) !== (nextExp?.getTime() ?? null);
    const ipChanged = (o.mgmtIp ?? null) !== (nextMgmtIp ?? null);
    if (expChanged || ipChanged) {
      batch.push(prisma.onu.update({ where: { id: o.id }, data: { mgmtIp: nextMgmtIp, expiration: nextExp } }));
      updated++;
      if (batch.length >= 50) {
        await Promise.all(batch.splice(0));
      }
    }
  }
  if (batch.length) await Promise.all(batch);
  return updated;
}
