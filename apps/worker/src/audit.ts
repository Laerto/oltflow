import { prisma, Prisma } from "@oltflow/db";
import { sanitizePayload } from "@oltflow/core";

export async function writeAudit(opts: {
  action: string;
  oltId?: number | null;
  ponPort?: string | null;
  payload?: Record<string, unknown>;
  result: "success" | "error";
  userId?: number | null;
}) {
  await prisma.auditLog.create({
    data: {
      action: opts.action,
      oltId: opts.oltId ?? null,
      ponPort: opts.ponPort ?? null,
      payload: opts.payload ? (sanitizePayload(opts.payload) as Prisma.InputJsonValue) : undefined,
      result: opts.result,
      userId: opts.userId ?? null,
    },
  });
}
