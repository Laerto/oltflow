import { prisma } from "@oltflow/db";
import { scanOltSignals } from "@oltflow/adapters";
import { loadOlt, toCreds } from "../olt-creds.js";
import { recordSignal } from "../persist.js";
import { withOltLock, OltBusyError } from "../olt-lock.js";

export async function syncOltSignals(oltId: number): Promise<number> {
  const olt = await loadOlt(oltId);
  const onus = await prisma.onu.findMany({
    where: { oltId: olt.id, state: "working" },
    select: { id: true, ponPort: true },
  });
  if (!onus.length) return 0;

  let signals;
  try {
    signals = await withOltLock(olt.id, () => scanOltSignals(toCreds(olt), onus.map((o) => o.ponPort)), { maxWaitMs: 5000 });
  } catch (err) {
    if (err instanceof OltBusyError) throw err; // propagate → worker re-enqueues soon (avoids 5-min starvation)
    throw err;
  }
  let written = 0;
  for (const onu of onus) {
    const signal = signals.get(onu.ponPort);
    if (!signal) continue;
    await recordSignal(onu.id, signal);
    written++;
  }
  return written;
}
