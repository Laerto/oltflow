import { setOnuName } from "@oltflow/adapters";
import { sanitizeOutput, type SetOnuNamePayload } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

/** Renames an already-provisioned ONU on the OLT (registration typo fix), then mirrors the new
 * name into Postgres so the panel updates immediately (the next detail sweep confirms it). */
export async function handleSetOnuName(payload: SetOnuNamePayload) {
  const olt = await loadOlt(payload.oltId);
  const { output } = await withOltLock(olt.id, () => setOnuName(toCreds(olt), payload.ponPort, payload.name));
  await prisma.onu.update({ where: { id: payload.onuId }, data: { name: payload.name } });
  return { message: `Emri u ndryshua në "${payload.name}"`, output: sanitizeOutput(output) };
}
