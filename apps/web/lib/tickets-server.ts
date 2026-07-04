import { prisma } from "@oltflow/db";
import { allowedOltIds } from "./olt-access";
import type { SessionPayload } from "./auth";

/** Fields returned for a ticket across all ticket routes (kept in one place so list and
 * detail never drift). */
export const ticketSelect = {
  id: true,
  oltId: true,
  category: true,
  severity: true,
  title: true,
  description: true,
  status: true,
  resolutionNote: true,
  rxAtOpen: true,
  oltRxAtOpen: true,
  rxAtVerify: true,
  openedAt: true,
  assignedAt: true,
  startedAt: true,
  resolvedAt: true,
  verifiedAt: true,
  assignedToId: true,
  onu: { select: { id: true, name: true, ponPort: true, serial: true } },
  olt: { select: { id: true, name: true } },
  openedBy: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

/** Whether a session may see/act on a ticket: the assigned technician, or office
 * (support/admin) whose OLT scope includes the ticket's OLT. */
export async function canAccessTicket(session: SessionPayload, ticket: { oltId: number; assignedToId: number | null }): Promise<boolean> {
  if (session.role === "technician") return ticket.assignedToId === Number(session.sub);
  const allowed = await allowedOltIds(session);
  return allowed === "all" || allowed.includes(ticket.oltId);
}
