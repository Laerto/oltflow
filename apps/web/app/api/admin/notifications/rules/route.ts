import { NextResponse } from "next/server";
import { prisma } from "@oltflow/db";
import { EVENT_TYPES, CHANNEL_TYPES, BEHAVIORS } from "@oltflow/core";
import { requirePerm } from "@/lib/authorize";

export async function GET() {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;

  const rules = await prisma.notificationRule.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json({
    rules: rules.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    meta: { eventTypes: EVENT_TYPES, channels: CHANNEL_TYPES, behaviors: BEHAVIORS },
  });
}

export async function POST(request: Request) {
  const auth = await requirePerm("integrations.manage");
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.eventType || !body?.channels) {
    return NextResponse.json({ error: "name, eventType, channels required" }, { status: 400 });
  }

  const rule = await prisma.notificationRule.create({
    data: {
      name: String(body.name),
      eventType: String(body.eventType),
      severityMin: body.severityMin ?? null,
      enabled: body.enabled !== false,
      scopeAll: body.scopeAll !== false,
      oltIds: Array.isArray(body.oltIds) ? body.oltIds.map(Number) : [],
      channels: body.channels,
      behavior: body.behavior ?? "once_until_clear",
      quietStart: body.quietStart ?? null,
      quietEnd: body.quietEnd ?? null,
    },
  });

  await prisma.auditLog
    .create({
      data: {
        userId: Number(session.sub),
        action: "notification_rule_create",
        result: "success",
        payload: { id: rule.id, name: rule.name },
      },
    })
    .catch(() => {});

  return NextResponse.json({ rule });
}
