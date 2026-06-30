import { PrismaClient, Prisma } from "@prisma/client";
import type { Olt, Onu, Signal, User, AuditLog, Job } from "@prisma/client";

// Singleton pattern to avoid exhausting Postgres connections across Next.js
// dev-mode hot reloads, per Prisma's own recommendation.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Named (not wildcard) re-exports: `export *` from a CJS module whose exports are
// constructed dynamically (as @prisma/client's are) isn't reliably statically
// analyzable by bundlers — it broke Turbopack resolution of this entire package.
export { PrismaClient, Prisma };
export type { Olt, Onu, Signal, User, AuditLog, Job };
