import { prisma } from "@oltflow/db";
import { scanCardInventory, scanUplinkOptical } from "@oltflow/adapters";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock, OltBusyError, isOltWanted } from "../olt-lock.js";
import { log } from "../logger.js";

/**
 * Dedicated FAST poll of the chassis snapshot (`show card` inventory + uplink optical DDM),
 * separate from the ~15-min detail sweep, so a backhaul uplink drop is picked up (and alarmed)
 * within a couple of minutes instead of a quarter hour. Light: a handful of `show` reads for the
 * uplink boards (~2-3s). Grabs the OLT lock briefly and yields immediately if an operator command
 * is waiting — a skipped poll just retries next tick. Read-only. Writes Olt.shelf.
 */
export async function syncShelf(oltId: number): Promise<void> {
  const olt = await loadOlt(oltId);
  try {
    await withOltLock(
      olt.id,
      async () => {
        if (await isOltWanted(olt.id)) return; // operator command queued → let it win, retry next tick
        const creds = toCreds(olt);
        let cards = await scanCardInventory(creds);
        cards = await scanUplinkOptical(creds, cards);
        // Round-trip through JSON so Prisma's Json input sees no `undefined` (invalid in JSON).
        const shelf = JSON.parse(JSON.stringify({ at: new Date().toISOString(), cards }));
        await prisma.olt.update({ where: { id: olt.id }, data: { shelf } });
      },
      { maxWaitMs: 2500, interactive: false }
    );
  } catch (err) {
    if (err instanceof OltBusyError) return; // busy with the main sweep / a command → next tick
    log.warn({ oltId, err: (err as Error).message }, "shelf poll failed");
  }
}
