import { prisma, type Onu } from "@oltflow/db";

export interface OnuUpsertFields {
  serial?: string | null;
  name?: string | null;
  type?: string | null;
  state?: string | null;
  distance?: string | null;
  onlineDuration?: string | null;
  vlan?: string | null;
  pppoeUser?: string | null;
  lineProfile?: string | null;
  serviceProfile?: string | null;
  mac?: string | null;
}

export async function upsertOnu(oltId: number, ponPort: string, fields: OnuUpsertFields): Promise<Onu> {
  return prisma.onu.upsert({
    where: { oltId_ponPort: { oltId, ponPort } },
    create: { oltId, ponPort, ...fields, lastSeen: new Date() },
    update: { ...fields, lastSeen: new Date() },
  });
}

/** Upserts many ONU rows in bounded-concurrency batches instead of one
 * sequential await per row — at 1000+ ONUs per OLT, a fully serial loop
 * turns a sync tick into 1000+ sequential DB round-trips. */
export async function batchUpsertOnus(
  oltId: number,
  rows: { ponPort: string; fields: OnuUpsertFields }[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await Promise.all(batch.map((row) => upsertOnu(oltId, row.ponPort, row.fields)));
  }
}

/** Reconciles the persisted unconfigured-ONU set for an OLT against a fresh
 * `show gpon onu uncfg` scan: removes serials that are gone (authorized or
 * physically detached) and upserts the ones seen now. Keeps the "waiting
 * authorization" count accurate from the DB without an on-demand device scan. */
export async function reconcileUnconfigured(
  oltId: number,
  rows: { ponPort: string; serial: string; state: string }[]
): Promise<void> {
  const serials = rows.map((r) => r.serial);
  await prisma.$transaction([
    serials.length
      ? prisma.uncfgOnu.deleteMany({ where: { oltId, serial: { notIn: serials } } })
      : prisma.uncfgOnu.deleteMany({ where: { oltId } }),
    ...rows.map((r) =>
      prisma.uncfgOnu.upsert({
        where: { oltId_serial: { oltId, serial: r.serial } },
        create: { oltId, ponPort: r.ponPort, serial: r.serial, state: r.state },
        update: { ponPort: r.ponPort, state: r.state, lastSeen: new Date() },
      })
    ),
  ]);
}

export interface SignalFields {
  oltRx?: number;
  onuRx?: number;
  oltTx?: number;
  onuTx?: number;
  attenUp?: number;
  attenDown?: number;
  signalLevel?: string;
}

export async function recordSignal(onuId: number, signal: SignalFields): Promise<void> {
  if (signal.onuRx === undefined) return;
  await prisma.signal.create({
    data: {
      onuId,
      oltRx: signal.oltRx,
      onuRx: signal.onuRx,
      oltTx: signal.oltTx,
      onuTx: signal.onuTx,
      attenUp: signal.attenUp,
      attenDown: signal.attenDown,
      signalLevel: signal.signalLevel,
    },
  });
}
