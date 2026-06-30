import { deleteOnu } from "@oltflow/adapters";
import { parsePonPort, sanitizeOutput, type DeleteOnuPayload } from "@oltflow/core";
import { prisma } from "@oltflow/db";
import { loadOlt, toCreds } from "../olt-creds.js";
import { withOltLock } from "../olt-lock.js";

export async function handleDeleteOnu(payload: DeleteOnuPayload) {
  const olt = await loadOlt(payload.oltId);
  const pon = parsePonPort(payload.ponPort);
  const { output, onuInterface } = await withOltLock(olt.id, () =>
    deleteOnu(toCreds(olt), { pon })
  );

  // Drop the inventory row (signals cascade) once the OLT has de-provisioned it, so the
  // ONU disappears from the UI immediately instead of lingering until the next sync.
  await prisma.onu.deleteMany({ where: { id: payload.onuId } });

  return {
    message: `ONU në ${payload.ponPort} u fshi nga OLT`,
    onuInterface,
    output: sanitizeOutput(output),
  };
}
