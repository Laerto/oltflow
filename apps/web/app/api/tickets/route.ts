import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { createTicketSchema, TICKET_CATEGORY_LABELS, OPEN_TICKET_STATUSES, type TicketCategory } from "@oltflow/core";
import { requireUser } from "@/lib/auth";
import { allowedOltIds } from "@/lib/olt-access";
import { sendTelegramTo } from "@/lib/telegram";
import { ticketSelect } from "@/lib/tickets-server";

// GET /api/tickets — technicians see their assigned tickets; office (support/admin) sees all
// tickets within their OLT scope. ?status=open (default worklist) | all | <status>.
export async function GET(request: Request) {
  const session = await requireUser();
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "open";
  const isTechnician = session.role === "technician";

  const where: Record<string, unknown> = {};
  if (statusParam === "open") where.status = { in: OPEN_TICKET_STATUSES };
  else if (statusParam !== "all") where.status = statusParam;

  if (isTechnician) {
    where.assignedToId = Number(session.sub);
  } else {
    const allowed = await allowedOltIds(session);
    if (allowed !== "all") where.oltId = { in: allowed };
  }

  const tickets = await prisma.ticket.findMany({
    where,
    select: ticketSelect,
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    take: 300,
  });
  return NextResponse.json({ tickets });
}

// POST /api/tickets — office opens a ticket (proxy gates to OPERATE tier). Snapshots the
// ONU's latest signal as the objective before-value, and optionally assigns + notifies a
// technician on open.
export async function POST(request: Request) {
  const session = await requireUser();
  const parsed = createTicketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Të dhëna jo të vlefshme" }, { status: 400 });
  }
  const input = parsed.data;

  const onu = await prisma.onu.findUnique({
    where: { id: input.onuId },
    select: { id: true, name: true, ponPort: true, oltId: true, olt: { select: { name: true } } },
  });
  if (!onu) return NextResponse.json({ error: "ONU nuk u gjet" }, { status: 404 });

  // OLT-scope guard: office can only open tickets on ONUs in their zone.
  const allowed = await allowedOltIds(session);
  if (allowed !== "all" && !allowed.includes(onu.oltId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Objective before-signal snapshot from the most recent sample.
  const sig = await prisma.signal.findFirst({
    where: { onuId: onu.id },
    orderBy: { recordedAt: "desc" },
    select: { onuRx: true, oltRx: true, signalLevel: true },
  });

  const assigneeId = input.assignedToId ?? null;
  const ticket = await prisma.ticket.create({
    data: {
      onuId: onu.id,
      oltId: onu.oltId,
      category: input.category,
      severity: sig?.signalLevel === "critical" || sig?.signalLevel === "warning" ? sig.signalLevel : null,
      title: input.title,
      description: input.description ?? null,
      status: assigneeId ? "assigned" : "open",
      openedById: Number(session.sub),
      assignedToId: assigneeId,
      assignedAt: assigneeId ? new Date() : null,
      rxAtOpen: sig?.onuRx ?? null,
      oltRxAtOpen: sig?.oltRx ?? null,
    },
    select: ticketSelect,
  });

  if (assigneeId) {
    const tech = await prisma.user.findUnique({ where: { id: assigneeId }, select: { telegramChatId: true, name: true } });
    const catLabel = TICKET_CATEGORY_LABELS[input.category as TicketCategory] ?? input.category;
    await sendTelegramTo(
      tech?.telegramChatId,
      `🔧 <b>Tiket i ri #${ticket.id}</b>\n${catLabel} — ${input.title}\nONU: ${onu.name || onu.ponPort} · OLT: ${onu.olt.name}` +
        (sig?.onuRx != null ? `\nSinjal: ${sig.onuRx} dBm` : "")
    );
  }

  return NextResponse.json({ ticket }, { status: 201 });
}
