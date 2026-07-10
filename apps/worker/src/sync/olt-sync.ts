import { prisma, getNumberSetting, SETTING_KEYS } from "@oltflow/db";
import {
  scanOltState,
  scanOltEponState,
  scanUnconfigured,
  scanEponUnauthenticated,
  scanOltSignals,
  scanOltInventory,
  scanEponInventory,
  type InventoryRow,
} from "@oltflow/adapters";
import { DEFAULT_PORTS_PER_SLOT, DEFAULT_EPON_PORTS_PER_SLOT } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { batchUpsertOnus, reconcileUnconfigured, recordSignal } from "../persist.js";
import { withOltLock, OltBusyError, isOltWanted } from "../olt-lock.js";
import { kv } from "../kv.js";

// How many working ONUs a single signal batch scans before yielding to a waiting operator.
const SIGNAL_BATCH = 40;

/** Map an inventory row to a batchUpsertOnus entry (shared by the per-slot GPON and EPON passes). */
function toDetailUpsert(row: InventoryRow) {
  return {
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
  };
}

async function due(key: string, intervalMs: number): Promise<boolean> {
  const last = Number(await kv.get(key));
  return !last || Date.now() - last >= intervalMs;
}

async function signalIntervalMs(): Promise<number> {
  try {
    return await getNumberSetting(SETTING_KEYS.signalIntervalMs);
  } catch {
    return Number(process.env.SIGNAL_INTERVAL_MS ?? 300_000);
  }
}

async function detailIntervalMs(): Promise<number> {
  try {
    return await getNumberSetting(SETTING_KEYS.detailIntervalMs);
  } catch {
    return Number(process.env.DETAIL_INTERVAL_MS ?? 900_000);
  }
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
  const [sigMs, detMs] = await Promise.all([signalIntervalMs(), detailIntervalMs()]);
  const wantSignal = await due(`sync:sig:${oltId}`, sigMs);
  const wantDetail = await due(`sync:det:${oltId}`, detMs);

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

        // Cooperative preemption: if an operator command is blocked waiting for this OLT,
        // release the lock now (after the cheap state pass) and let them in — the expensive
        // signal/detail passes run on the next quiet tick instead of making the click time
        // out behind a multi-hundred-ONU sweep on a big OLT (KSAMIL/BORSH). Timestamps are
        // NOT advanced, so the skipped passes are still due next tick.
        if ((wantSignal || wantDetail) && (await isOltWanted(olt.id))) {
          return stateRows.length;
        }

        // 2) Signal (when due; medium) — scanned in batches so an operator command waiting on
        //    this OLT preempts between batches (worst-case wait ≈ one 40-ONU batch, not the whole
        //    working set). We check only after the first batch so every tick makes progress; on
        //    interruption the timestamp is NOT advanced, so signal re-runs next tick, and we
        //    release the lock immediately to the operator.
        if (wantSignal) {
          const working = await prisma.onu.findMany({ where: { oltId: olt.id, state: "working" }, select: { id: true, ponPort: true } });
          let sigInterrupted = false;
          for (let i = 0; i < working.length; i += SIGNAL_BATCH) {
            if (i > 0 && (await isOltWanted(olt.id))) { sigInterrupted = true; break; }
            const batch = working.slice(i, i + SIGNAL_BATCH);
            const signals = await scanOltSignals(creds, batch.map((o) => o.ponPort));
            for (const onu of batch) {
              const s = signals.get(onu.ponPort);
              if (s) await recordSignal(onu.id, s);
            }
          }
          if (sigInterrupted) return stateRows.length;
          await kv.set(`sync:sig:${oltId}`, String(Date.now()));
        }

        // 3) Detail (when due; slow) — scanned per-slot with a resume cursor so an operator
        //    command waiting on this OLT preempts mid-sweep (worst-case wait = one slot, not the
        //    whole OLT). At least one slot runs per tick so later slots can't be starved even if
        //    an operator interrupts most ticks; the timestamp only advances (and the cursor
        //    clears) once every slot has been scanned in a single uninterrupted pass.
        if (wantDetail) {
          const cursorKey = `sync:det:cursor:${oltId}`;
          let startAt = Number(await kv.get(cursorKey)) || 0;
          if (startAt >= olt.slots.length) startAt = 0; // slot list shrank ⇒ restart from the top
          let slot = startAt;
          let detInterrupted = false;
          for (; slot < olt.slots.length; slot++) {
            if (slot > startAt && (await isOltWanted(olt.id))) { detInterrupted = true; break; }
            const rows = await scanOltInventory(creds, [olt.slots[slot]!], DEFAULT_PORTS_PER_SLOT);
            await batchUpsertOnus(olt.id, rows.map(toDetailUpsert));
          }
          if (detInterrupted) {
            await kv.set(cursorKey, String(slot)); // resume here next tick
            return stateRows.length; // release the lock to the operator
          }
          // Finished every GPON slot this tick → EPON (small, single pass), then mark done.
          if (olt.eponSlots.length) {
            const epon = await scanEponInventory(creds, olt.eponSlots, DEFAULT_EPON_PORTS_PER_SLOT);
            await batchUpsertOnus(olt.id, epon.map(toDetailUpsert));
          }
          await kv.set(`sync:det:${oltId}`, String(Date.now()));
          await kv.del(cursorKey);
        }

        return stateRows.length;
      },
      { maxWaitMs: 8000, interactive: false }
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
