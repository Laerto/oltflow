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
    select: { id: true, type: true, pppoeUser: true, mac: true, mgmtIp: true, expiration: true, radiusUser: true, pppoeOnline: true },
  });

  let updated = 0;
  const batch: Promise<unknown>[] = [];
  for (const o of onus) {
    const bridge = onuConnectionKind(o.type) === "bridge";
    const macKey = o.mac ? normalizeMac(o.mac) : "";
    const session = macKey ? data.byMac.get(macKey) : undefined;
    // Resolve the subscriber: route uses pppoeUser, bridge uses the MAC's session username.
    const username = o.pppoeUser || session?.username || null;
    const client = username ? data.byUsername.get(username) : undefined;

    // For bridge ONUs mgmtIp is the Mikrotik IP (Winbox); for route ONUs it's the ONU's IP.
    const resolvedIp = bridge
      ? session?.liveIp || client?.staticIp || null
      : client?.liveIp || session?.liveIp || client?.staticIp || null;

    // Keep-last: never wipe a value RADIUS momentarily can't resolve (avoids flapping and
    // preserves a manually-set Winbox IP for clients not present in RADIUS).
    const nextMgmtIp = resolvedIp ?? o.mgmtIp ?? null;
    const nextExp = client?.expiration ?? o.expiration ?? null;
    // Remember the username stickily so a DOWN bridge session (which loses the MAC→user link) can
    // still be resolved to its account for the client.offline expiry filter + "who's connected".
    const nextRadiusUser = username ?? o.radiusUser ?? null;
    // Current session state — only meaningful once we know a user; null otherwise (don't guess).
    const hasSession = bridge ? Boolean(session?.liveIp) : Boolean(client?.liveIp || session?.liveIp);
    const nextOnline = o.pppoeUser || nextRadiusUser ? hasSession : null;

    const expChanged = (o.expiration?.getTime() ?? null) !== (nextExp?.getTime() ?? null);
    const ipChanged = (o.mgmtIp ?? null) !== (nextMgmtIp ?? null);
    const userChanged = (o.radiusUser ?? null) !== (nextRadiusUser ?? null);
    const onlineChanged = (o.pppoeOnline ?? null) !== (nextOnline ?? null);
    if (expChanged || ipChanged || userChanged || onlineChanged) {
      batch.push(
        prisma.onu.update({
          where: { id: o.id },
          data: { mgmtIp: nextMgmtIp, expiration: nextExp, radiusUser: nextRadiusUser, pppoeOnline: nextOnline },
        })
      );
      updated++;
      if (batch.length >= 50) {
        await Promise.all(batch.splice(0));
      }
    }
  }
  if (batch.length) await Promise.all(batch);
  return updated;
}
