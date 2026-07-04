import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { assignTicketSchema, TICKET_CATEGORY_LABELS, type TicketCategory } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { sendTelegramTo } from "@/lib/telegram";
import { ticketSelect, canAccessTicket } from "@/lib/tickets-server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) }, select: ticketSelect });
  if (!ticket) return NextResponse.json({ error: "Tiketi nuk u gjet" }, { status: 404 });
  if (!(await canAccessTicket(session, ticket))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json({ ticket });
}

// PATCH /api/tickets/[id] — (re)assign a technician. Office only (proxy gates to OPERATE).
// Sets status to "assigned" and DMs the technician (the "ring").
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const parsed = assignTicketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Të dhëna jo të vlefshme" }, { status: 400 });

  const existing = await prisma.ticket.findUnique({
    where: { id: Number(id) },
    select: { id: true, oltId: true, assignedToId: true, status: true, title: true, category: true, onu: { select: { name: true, ponPort: true } }, olt: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Tiketi nuk u gjet" }, { status: 404 });
  if (!(await canAccessTicket(session, existing))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const assigneeId = parsed.data.assignedToId;
  const ticket = await prisma.ticket.update({
    where: { id: existing.id },
    data: {
      assignedToId: assigneeId,
      assignedAt: assigneeId ? new Date() : null,
      // Assigning moves an untouched ticket to "assigned"; don't rewind one already in repair.
      status: assigneeId && (existing.status === "open" || existing.status === "reopened") ? "assigned" : existing.status,
    },
    select: ticketSelect,
  });

  if (assigneeId) {
    const tech = await prisma.user.findUnique({ where: { id: assigneeId }, select: { telegramChatId: true } });
    const catLabel = TICKET_CATEGORY_LABELS[existing.category as TicketCategory] ?? existing.category;
    await sendTelegramTo(
      tech?.telegramChatId,
      `🔧 <b>Tiket #${existing.id} të është caktuar</b>\n${catLabel} — ${existing.title}\nONU: ${existing.onu.name || existing.onu.ponPort} · OLT: ${existing.olt.name}`
    );
  }

  return NextResponse.json({ ticket });
}
