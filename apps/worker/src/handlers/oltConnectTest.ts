import { prisma } from "@oltflow/db";
import { testConnection } from "@oltflow/adapters";
import type { OltConnectTestPayload } from "@oltflow/core";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handleOltConnectTest(payload: OltConnectTestPayload) {
  const olt = await loadOlt(payload.oltId);
  const { ok, error } = await withOltLock(olt.id, () => testConnection(toCreds(olt)));
  await prisma.olt.update({
    where: { id: olt.id },
    data: { status: ok ? "online" : "offline" },
  });
  if (!ok) throw new Error(error ?? "Lidhja dështoi");
  return { ok: true, message: `Lidhja me OLT "${olt.name}" u verifikua` };
}
