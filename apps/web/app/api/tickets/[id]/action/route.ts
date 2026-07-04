import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { ticketActionSchema, allowedActions, nextStatusForAction, roleRank, TIER, canWorkTickets } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { ticketSelect, canAccessTicket } from "@/lib/tickets-server";

// POST /api/tickets/[id]/action — advance the repair workflow.
//   start / resolve → the assigned technician OR office (support/admin)
//   verify / reopen → office only (the objective before/after check happens here)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!canWorkTickets(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const parsed = ticketActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Veprim jo i vlefshëm" }, { status: 400 });
  const { action, resolutionNote } = parsed.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(id) },
    select: { id: true, oltId: true, onuId: true, assignedToId: true, status: true },
  });
  if (!ticket) return NextResponse.json({ error: "Tiketi nuk u gjet" }, { status: 404 });
  if (!(await canAccessTicket(session, ticket))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Only valid transitions from the current status.
  if (!allowedActions(ticket.status).includes(action)) {
    return NextResponse.json({ error: `Veprimi "${action}" s'lejohet nga statusi "${ticket.status}"` }, { status: 409 });
  }
  // Verification/reopen are the office's call, not the technician's.
  if ((action === "verify" || action === "reopen") && roleRank(session.role) < TIER.OPERATE) {
    return NextResponse.json({ error: "Vetëm zyra mund të verifikojë/rihapë" }, { status: 403 });
  }

  const data: Record<string, unknown> = { status: nextStatusForAction(action) };
  const now = new Date();
  if (action === "start") data.startedAt = now;
  if (action === "resolve") {
    data.resolvedAt = now;
    if (resolutionNote) data.resolutionNote = resolutionNote;
  }
  if (action === "verify") {
    data.verifiedAt = now;
    // Objective after-value: the latest signal sample at verification time.
    const sig = await prisma.signal.findFirst({
      where: { onuId: ticket.onuId },
      orderBy: { recordedAt: "desc" },
      select: { onuRx: true },
    });
    data.rxAtVerify = sig?.onuRx ?? null;
  }
  if (action === "reopen") {
    // Back into the queue; keep the repair history but clear the resolution stamp.
    data.resolvedAt = null;
    data.startedAt = null;
  }

  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data, select: ticketSelect });
  return NextResponse.json({ ticket: updated });
}
