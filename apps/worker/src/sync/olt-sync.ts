import { prisma } from "@oltflow/db";
import {
  scanOltState,
  scanOltEponState,
  scanUnconfigured,
  scanEponUnauthenticated,
  scanOltSignals,
  scanOltInventory,
  scanEponInventory,
} from "@oltflow/adapters";
import { DEFAULT_PORTS_PER_SLOT, DEFAULT_EPON_PORTS_PER_SLOT } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { batchUpsertOnus, reconcileUnconfigured, recordSignal } from "../persist.js";
import { withOltLock, OltBusyError } from "../olt-lock.js";
import { kv } from "../kv.js";

const SIGNAL_INTERVAL_MS = Number(process.env.SIGNAL_INTERVAL_MS ?? 300_000);
const DETAIL_INTERVAL_MS = Number(process.env.DETAIL_INTERVAL_MS ?? 900_000);

async function due(key: string, intervalMs: number): Promise<boolean> {
  const last = Number(await kv.get(key));
  return !last || Date.now() - last >= intervalMs;
}

/**
 * Combined per-OLT sync. Acquires the OLT lock ONCE and runs the passes in sequence —
 * state (+uncfg) every tick, signal when due (~5 min), detail when due (~15 min) — instead
 * of three separate jobs fighting the same lock. That old contention, plus a re-enqueue on
 * every busy skip, produced a 1500+ job backlog and made user commands (authorize/refresh/
 * live) fail with "OLT busy". Here there is exactly one deduped sync per OLT at a time
 * (scheduler uses a fixed jobId), so nothing piles up; a busy skip just waits for the next
 * tick. On-demand user jobs keep their own longer lock wait, so they win the lock between
 * ticks.
 */
export async function syncOlt(oltId: number): Promise<number> {
  const olt = await loadOlt(oltId);
  const wantSignal = await due(`sync:sig:${oltId}`, SIGNAL_INTERVAL_MS);
  const wantDetail = await due(`sync:det:${oltId}`, DETAIL_INTERVAL_MS);

  try {
    const count = await withOltLock(
      olt.id,
      async () => {
        const creds = toCreds(olt);

        // 1) State + unconfigured (always; fast).
        const gponRows = await scanOltState(creds, olt.slots, DEFAULT_PORTS_PER_SLOT);
        const eponRows = olt.eponSlots.length ? await scanOltEponState(creds, olt.eponSlots, DEFAULT_EPON_PORTS_PER_SLOT) : [];
        const uncfg = await scanUnconfigured(creds);
        const eponUncfg = olt.eponSlots.length ? await scanEponUnauthenticated(creds) : [];
        const stateRows = [...gponRows, ...eponRows];
        await batchUpsertOnus(
          olt.id,
          stateRows.map((r) => ({ ponPort: r.ponPort, fields: r.serial ? { state: r.state, serial: r.serial } : { state: r.state } }))
        );
        await reconcileUnconfigured(olt.id, [...uncfg, ...eponUncfg]);

        // 2) Signal (when due; medium).
        if (wantSignal) {
          const working = await prisma.onu.findMany({ where: { oltId: olt.id, state: "working" }, select: { id: true, ponPort: true } });
          if (working.length) {
            const signals = await scanOltSignals(creds, working.map((o) => o.ponPort));
            for (const onu of working) {
              const s = signals.get(onu.ponPort);
              if (s) await recordSignal(onu.id, s);
            }
          }
          await kv.set(`sync:sig:${oltId}`, String(Date.now()));
        }

        // 3) Detail (when due; slow).
        if (wantDetail) {
          const gpon = await scanOltInventory(creds, olt.slots, DEFAULT_PORTS_PER_SLOT);
          const epon = olt.eponSlots.length ? await scanEponInventory(creds, olt.eponSlots, DEFAULT_EPON_PORTS_PER_SLOT) : [];
          await batchUpsertOnus(
            olt.id,
            [...gpon, ...epon].map((row) => ({
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
                mac: row.mac,
              },
            }))
          );
          await kv.set(`sync:det:${oltId}`, String(Date.now()));
        }

        return stateRows.length;
      },
      { maxWaitMs: 8000 }
    );

    await prisma.olt.update({ where: { id: olt.id }, data: { status: "online", lastSync: new Date() } });
    return count;
  } catch (err) {
    // Busy with a user action → skip; the deduped scheduler tick retries next cycle. Don't
    // mark offline (the OLT is reachable, just locked).
    if (err instanceof OltBusyError) return 0;
    await prisma.olt.update({ where: { id: olt.id }, data: { status: "offline" } });
    throw err;
  }
}
