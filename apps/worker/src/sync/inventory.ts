import { prisma } from "@oltflow/db";
import { scanOltState, scanOltEponState, scanOltInventory, scanUnconfigured } from "@oltflow/adapters";
import { DEFAULT_PORTS_PER_SLOT, DEFAULT_EPON_PORTS_PER_SLOT } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { batchUpsertOnus, reconcileUnconfigured } from "../persist.js";
import { withOltLock, OltBusyError } from "../olt-lock.js";

/** Fast pass — state only, safe to run every SYNC_INTERVAL_MS even with
 * thousands of ONUs per OLT (no per-ONU round-trip). Also sweeps EPON boards
 * (monitoring only — see isEponPort gating in the UI/API for why EPON has no
 * provisioning write-path yet) when the OLT has any `eponSlots` configured. */
export async function syncOltInventory(oltId: number): Promise<number> {
  const olt = await loadOlt(oltId);
  try {
    // One device session per tick covers both inventory state and the unconfigured
    // (waiting-authorization) scan, so the "waiting" count stays continuously accurate
    // without a separate on-demand scan that would add network round-trips / delay.
    const { rows, uncfg } = await withOltLock(olt.id, async () => {
      const creds = toCreds(olt);
      const gponRows = await scanOltState(creds, olt.slots, DEFAULT_PORTS_PER_SLOT);
      const eponRows = olt.eponSlots.length
        ? await scanOltEponState(creds, olt.eponSlots, DEFAULT_EPON_PORTS_PER_SLOT)
        : [];
      const uncfg = await scanUnconfigured(creds);
      return { rows: [...gponRows, ...eponRows], uncfg };
    });

    await batchUpsertOnus(
      olt.id,
      rows.map((row) => ({
        ponPort: row.ponPort,
        fields: row.serial ? { state: row.state, serial: row.serial } : { state: row.state },
      }))
    );
    await reconcileUnconfigured(olt.id, uncfg);

    await prisma.olt.update({ where: { id: olt.id }, data: { status: "online", lastSync: new Date() } });
    return rows.length;
  } catch (err) {
    if (err instanceof OltBusyError) return 0; // a provision/detail job is already using this OLT — skip this tick
    await prisma.olt.update({ where: { id: olt.id }, data: { status: "offline" } });
    throw err;
  }
}

/** Slow pass — full detail-info + running-config per ONU (~1.6s/ONU). Run on
 * DETAIL_INTERVAL_MS (minutes, not seconds) once an OLT has more than a
 * couple hundred ONUs. */
export async function syncOltDetail(oltId: number): Promise<number> {
  const olt = await loadOlt(oltId);
  let rows;
  try {
    rows = await withOltLock(olt.id, () => scanOltInventory(toCreds(olt), olt.slots, DEFAULT_PORTS_PER_SLOT));
  } catch (err) {
    if (err instanceof OltBusyError) return 0; // skip this tick, another job owns the OLT session right now
    throw err;
  }

  await batchUpsertOnus(
    olt.id,
    rows.map((row) => ({
      ponPort: row.ponPort,
      fields: {
        serial: row.serial,
        name: row.name,
        type: row.type,
        state: row.state,
        distance: row.distance,
        onlineDuration: row.onlineDuration,
        vlan: row.vlan,
        pppoeUser: row.pppoeUser,
        lineProfile: row.lineProfile,
        serviceProfile: row.serviceProfile,
      },
    }))
  );

  return rows.length;
}
